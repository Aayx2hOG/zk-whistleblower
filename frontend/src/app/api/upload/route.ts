import { NextRequest, NextResponse } from "next/server";

function normalizeJwt(value: string): string {
  const trimmed = value.trim().replace(/^['\"]|['\"]$/g, "");
  return trimmed.replace(/^Bearer\s+/i, "").trim();
}

/**
 * POST /api/upload
 * Body: JSON (EncryptedBlob — already encrypted client-side)
 * Returns: { cid: string }
 *
 * The Pinata JWT lives in PINATA_JWT (server-only env var) and is never sent
 * to the browser. The server only ever sees the ciphertext — plaintext never
 * leaves the submitter's browser.
 */
export async function POST(req: NextRequest) {
  const rawJwt =
    process.env.PINATA_JWT ??
    process.env.PINATA_JWT_SERVER ??
    process.env.NEXT_PUBLIC_PINATA_JWT;
  if (!rawJwt) {
    return NextResponse.json(
      {
        error:
          "Pinata JWT not configured. Set PINATA_JWT in frontend/.env.local and restart `pnpm dev`.",
      },
      { status: 500 }
    );
  }

  const jwt = normalizeJwt(rawJwt);
  if (jwt.split(".").length !== 3) {
    return NextResponse.json(
      {
        error:
          "Pinata JWT is malformed. Paste only the raw JWT (three dot-separated parts), not API key/secret or extra text.",
      },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Wrap the JSON blob in a multipart form that Pinata expects
  const fileBlob = new Blob([JSON.stringify(body)], { type: "application/json" });
  const form = new FormData();
  form.append("file", fileBlob, "report.json");
  form.append(
    "pinataMetadata",
    JSON.stringify({ name: `report-${Date.now()}` })
  );
  form.append(
    "pinataOptions",
    JSON.stringify({ cidVersion: 1 })
  );

  const pinataRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!pinataRes.ok) {
    const text = await pinataRes.text();
    return NextResponse.json(
      { error: `Pinata error: ${text}` },
      { status: pinataRes.status }
    );
  }

  const data = (await pinataRes.json()) as { IpfsHash: string };
  return NextResponse.json({ cid: data.IpfsHash });
}
