// IPFS upload goes through /api/upload (a Next.js server route) so the Pinata JWT
// never touches the browser. Fetching is done directly from the public Pinata gateway.

import type { EncryptedBlob } from "./encryption";
import type { EncryptedFileBlob, ReportManifest } from "./fileEncryption";

function normalizeCid(input: string): string {
  const raw = input.trim();
  if (!/^0x[0-9a-fA-F]+$/.test(raw)) return raw;

  try {
    const hex = raw.slice(2);
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
    const decoded = new TextDecoder().decode(bytes).replace(/\u0000+$/g, "").trim();
    return decoded || raw;
  } catch {
    return raw;
  }
}

function validateCid(cid: string): void {
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(cid)) {
    throw new Error("Invalid CID format");
  }
}

async function readApiErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as { error?: unknown; message?: unknown };
      if (typeof data.error === "string" && data.error.trim()) {
        return data.error.trim();
      }
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message.trim();
      }
      return JSON.stringify(data);
    }

    const text = (await res.text()).trim();
    return text || "No error response body";
  } catch {
    return "Could not parse error response";
  }
}

async function uploadViaApi(payload: unknown, failurePrefix: string): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const message = await readApiErrorMessage(res);
    throw new Error(`${failurePrefix} (${res.status}): ${message}`);
  }

  const data = (await res.json()) as { cid?: unknown };
  if (typeof data.cid !== "string" || !data.cid.trim()) {
    throw new Error("Upload succeeded but no CID was returned.");
  }

  return data.cid;
}

export async function uploadEncryptedReport(blob: EncryptedBlob): Promise<string> {
  return uploadViaApi(blob, "Upload failed");
}

export async function uploadEncryptedFile(blob: EncryptedFileBlob): Promise<string> {
  return uploadViaApi(blob, "File upload failed");
}

export async function uploadManifest(manifest: ReportManifest): Promise<string> {
  return uploadViaApi(manifest, "Manifest upload failed");
}

export async function fetchFromIPFS(cid: string): Promise<EncryptedBlob> {
  const normalizedCid = normalizeCid(cid);
  validateCid(normalizedCid);
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${normalizedCid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed (${res.status}): ${res.statusText}`);
  return res.json() as Promise<EncryptedBlob>;
}

export async function fetchJsonFromIPFS<T = unknown>(cid: string): Promise<T> {
  const normalizedCid = normalizeCid(cid);
  validateCid(normalizedCid);
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${normalizedCid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed (${res.status}): ${res.statusText}`);
  return res.json() as Promise<T>;
}
