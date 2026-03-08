// IPFS upload goes through /api/upload (a Next.js server route) so the Pinata JWT
// never touches the browser. Fetching is done directly from the public Pinata gateway.

import type { EncryptedBlob } from "./encryption";

export async function uploadEncryptedReport(blob: EncryptedBlob): Promise<string> {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(blob),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as { cid: string };
  return data.cid;
}

export async function fetchFromIPFS(cid: string): Promise<EncryptedBlob> {
  // Reject anything that isn't a well-formed CID before building the gateway URL.
  // CIDv0 = Qm + 44 base58 chars, CIDv1 = b + base32 chars (bafy…, bafk…, etc.)
  if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(cid)) {
    throw new Error("Invalid CID format");
  }
  const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
  if (!res.ok) throw new Error(`IPFS fetch failed (${res.status}): ${res.statusText}`);
  return res.json() as Promise<EncryptedBlob>;
}
