// Browser-side secret generation and encryption for admin key file creation.
// Mirrors the Node.js logic in scripts/register-members.ts so key files
// generated here are compatible with those from the script.

export interface EncryptedSecret {
  iv: string;
  salt: string;
  ciphertext: string;
  tag: string;
}

export interface MemberKeyFile {
  memberId: string;
  commitment: string;
  encrypted: EncryptedSecret;
}

export interface MemberManifest {
  commitments: string[];
  root: string;
  memberCount: number;
  treeDepth: number;
}

function bytesToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const pairs = hex.match(/.{2}/g);
  if (!pairs) throw new Error("Invalid hex string");
  const buf = new ArrayBuffer(pairs.length);
  const view = new Uint8Array(buf);
  pairs.forEach((b, i) => {
    view[i] = parseInt(b, 16);
  });
  return view;
}

// 31 bytes keeps the value inside the BN128 scalar field, same as the Node.js script.
export function generateSecret(): bigint {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  return BigInt("0x" + bytesToHex(bytes));
}

// Produces the same AES-256-GCM format as the Node.js encryptSecret in register-members.ts.
export async function encryptSecret(
  secret: bigint,
  password: string
): Promise<EncryptedSecret> {
  const enc = new TextEncoder();

  const salt = new Uint8Array(new ArrayBuffer(16));
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(new ArrayBuffer(12));
  crypto.getRandomValues(iv);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const secretBytes = enc.encode(secret.toString());
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    secretBytes
  );

  // Web Crypto appends the 16-byte auth tag at the tail of the output buffer.
  const arr = new Uint8Array(encrypted);
  const ciphertext = arr.slice(0, arr.length - 16);
  const tag = arr.slice(arr.length - 16);

  return {
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
    ciphertext: bytesToHex(ciphertext),
    tag: bytesToHex(tag),
  };
}

// Decryption 

/**
 * Decrypts a key file's encrypted payload back to the original secret bigint.
 * Works with files produced by both this module and the Node.js script.
 */
export async function decryptSecret(
  encrypted: EncryptedSecret,
  password: string
): Promise<bigint> {
  const enc = new TextEncoder();

  const salt = hexToBytes(encrypted.salt);
  const iv = hexToBytes(encrypted.iv);
  const ciphertext = hexToBytes(encrypted.ciphertext);
  const tag = hexToBytes(encrypted.tag);

  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  const aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100_000, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  // Web Crypto expects ciphertext || authTag in a single ArrayBuffer.
  const combined = new Uint8Array(ciphertext.length + tag.length);
  combined.set(ciphertext);
  combined.set(tag, ciphertext.length);

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      combined
    );
  } catch {
    throw new Error("Decryption failed — wrong password or corrupted key file.");
  }

  return BigInt(new TextDecoder().decode(decrypted));
}

//  Download helper 

/* Triggers a browser download of a JSON object. */
export function downloadJSON(data: object, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
