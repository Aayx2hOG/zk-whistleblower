// AES-256-GCM encryption and decryption, entirely in the browser.
// The key is derived from a password using PBKDF2 (210k iterations) so you never
// have to store raw key bytes anywhere — just the password.

export interface EncryptedBlob {
  v: 1;
  iv: string;   // base64, 12-byte AES-GCM nonce
  salt: string; // base64, 16-byte PBKDF2 salt
  ct: string;   // base64, AES-GCM ciphertext + 16-byte auth tag
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  // Process in chunks so we don't blow the call stack on large ciphertexts
  let str = "";
  for (let i = 0; i < bytes.length; i += 4096) {
    str += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return btoa(str);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 210_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encrypt a report string and return a JSON-safe blob you can upload to IPFS.
export async function encryptReport(
  plaintext: string,
  password: string
): Promise<EncryptedBlob> {
  const enc  = new TextEncoder();
  // TypeScript 5 requires Uint8Array<ArrayBuffer> (not ArrayBufferLike) to satisfy the WebCrypto overloads
  const iv   = new Uint8Array(new ArrayBuffer(12)) as Uint8Array<ArrayBuffer>;
  const salt = new Uint8Array(new ArrayBuffer(16)) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(iv);
  crypto.getRandomValues(salt);
  const key  = await deriveKey(password, salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as Uint8Array<ArrayBuffer> },
    key,
    enc.encode(plaintext)
  );

  return { v: 1, iv: toBase64(iv), salt: toBase64(salt), ct: toBase64(ciphertext) };
}

// Decrypt a blob using the same password the submitter used.
// Throws if the password is wrong — AES-GCM's auth tag catches any tampering too.
export async function decryptReport(
  blob: EncryptedBlob,
  password: string
): Promise<string> {
  const iv   = fromBase64(blob.iv);
  const salt = fromBase64(blob.salt);
  const ct   = fromBase64(blob.ct);
  const key  = await deriveKey(password, salt);

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ct
  );
  return new TextDecoder().decode(plaintext);
}
