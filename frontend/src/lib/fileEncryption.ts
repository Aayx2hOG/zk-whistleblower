// File encryption/decryption using the same envelope encryption as text reports.
// AES-256-GCM for data encryption, RSA-OAEP for key wrapping.

export interface EncryptedFileBlob {
  v: 2;
  type: "file";
  alg: "AES-256-GCM+RSA-OAEP-256";
  orgId: number;
  keyVersion: number;
  filename: string;
  mimeType: string;
  originalSize: number;
  nonce: string;      // base64, 12-byte AES-GCM nonce
  ciphertext: string; // base64, AES-GCM ciphertext + tag
  wrappedKey: string; // base64, RSA-OAEP wrapped 32-byte AES key
}

export interface FileAttachmentMeta {
  cid: string;
  filename: string;
  mimeType: string;
  originalSize: number;
}

export interface ReportManifest {
  v: 1;
  type: "manifest";
  textCid: string;
  files: FileAttachmentMeta[];
  createdAt: string;
}

function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let str = "";
  for (let i = 0; i < bytes.length; i += 4096) {
    str += String.fromCharCode(...bytes.subarray(i, i + 4096));
  }
  return btoa(str);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
}

function sanitizeB64(input: string): string {
  return input.replace(/\s+/g, "").trim();
}

async function importRsaPublicKey(publicKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki",
    fromBase64(sanitizeB64(publicKeyB64)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
}

async function importRsaPrivateKey(privateKeyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "pkcs8",
    fromBase64(sanitizeB64(privateKeyB64)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
}

/**
 * Encrypt a File object using AES-256-GCM + RSA-OAEP key wrapping.
 * The file bytes are read entirely into memory, encrypted, and returned
 * as a JSON-serialisable blob.
 */
export async function encryptFile(
  file: File,
  publicKeyB64: string,
  orgId: number,
  keyVersion = 1
): Promise<EncryptedFileBlob> {
  const fileBytes = new Uint8Array(await file.arrayBuffer());

  const nonce = new Uint8Array(new ArrayBuffer(12)) as Uint8Array<ArrayBuffer>;
  const dataKeyBytes = new Uint8Array(new ArrayBuffer(32)) as Uint8Array<ArrayBuffer>;
  crypto.getRandomValues(nonce);
  crypto.getRandomValues(dataKeyBytes);

  const aesKey = await crypto.subtle.importKey(
    "raw",
    dataKeyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    fileBytes
  );

  const rsaPublicKey = await importRsaPublicKey(publicKeyB64);
  const wrappedKey = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    rsaPublicKey,
    dataKeyBytes
  );

  return {
    v: 2,
    type: "file",
    alg: "AES-256-GCM+RSA-OAEP-256",
    orgId,
    keyVersion,
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    originalSize: file.size,
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext),
    wrappedKey: toBase64(wrappedKey),
  };
}

/**
 * Decrypt an encrypted file blob using the org's RSA private key.
 * Returns the raw file bytes alongside the original filename and MIME type.
 */
export async function decryptFile(
  blob: EncryptedFileBlob,
  privateKeyB64: string
): Promise<{ data: Uint8Array; filename: string; mimeType: string }> {
  const nonce = fromBase64(blob.nonce);
  const ciphertext = fromBase64(blob.ciphertext);
  const wrappedKey = fromBase64(blob.wrappedKey);

  const rsaPrivateKey = await importRsaPrivateKey(privateKeyB64);
  const dataKeyBytes = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    rsaPrivateKey,
    wrappedKey
  );

  const aesKey = await crypto.subtle.importKey(
    "raw",
    dataKeyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    ciphertext
  );

  return {
    data: new Uint8Array(plaintext),
    filename: blob.filename,
    mimeType: blob.mimeType,
  };
}

/**
 * Check if a decrypted payload is a report manifest (v2 with file attachments)
 * vs. a plain text report (v1).
 */
export function isReportManifest(obj: unknown): obj is ReportManifest {
  return (
    typeof obj === "object" &&
    obj !== null &&
    (obj as ReportManifest).type === "manifest" &&
    typeof (obj as ReportManifest).textCid === "string" &&
    Array.isArray((obj as ReportManifest).files)
  );
}
