import { NextRequest, NextResponse } from "next/server";

function normalizeJwt(value: string): string {
  const trimmed = value.trim().replace(/^['\"]|['\"]$/g, "");
  return trimmed.replace(/^Bearer\s+/i, "").trim();
}

function truncate(text: string, max = 300): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function buildPinataForm(payload: unknown): FormData {
  const fileBlob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const form = new FormData();
  form.append("file", fileBlob, "report.json");
  form.append("pinataMetadata", JSON.stringify({ name: `report-${Date.now()}` }));
  form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
  return form;
}

async function readPinataErrorBody(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = (await res.json()) as { error?: unknown; message?: unknown };
      const message =
        (typeof json.error === "string" && json.error) ||
        (typeof json.message === "string" && json.message) ||
        JSON.stringify(json);
      return truncate(message);
    }
    return truncate((await res.text()).trim() || "No response body");
  } catch {
    return "Could not parse error response body";
  }
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
          "Pinata JWT not configured. Set PINATA_JWT in apps/admin/.env.local and restart the app.",
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

  const uploadUrl =
    process.env.PINATA_UPLOAD_URL?.trim() ||
    "https://api.pinata.cloud/pinning/pinFileToIPFS";

  let pinataRes: Response | undefined;
  let networkError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body: buildPinataForm(body),
      });

      pinataRes = res;
      const retriableStatus = res.status >= 500 || res.status === 429;
      if (!retriableStatus || attempt === 2) {
        break;
      }
    } catch (err: unknown) {
      networkError = err;
      if (attempt === 2) {
        break;
      }
    }
  }

  if (!pinataRes) {
    const message =
      networkError instanceof Error ? networkError.message : String(networkError ?? "Unknown error");
    return NextResponse.json(
      {
        error:
          `Pinata request failed before response: ${message}. ` +
          "Check internet access/firewall and verify api.pinata.cloud is reachable.",
      },
      { status: 502 }
    );
  }

  if (!pinataRes.ok) {
    const upstreamBody = await readPinataErrorBody(pinataRes);
    const requestId =
      pinataRes.headers.get("x-request-id") ??
      pinataRes.headers.get("x-pinata-requestid") ??
      "";

    let hint = "";
    if (pinataRes.status === 401 || pinataRes.status === 403) {
      hint = " JWT rejected - verify PINATA_JWT value, scope, and expiry.";
    } else if (pinataRes.status === 429) {
      hint = " Rate limited by Pinata - retry shortly.";
    } else if (pinataRes.status >= 500) {
      hint = " Pinata upstream error - retry in a minute.";
    }

    return NextResponse.json(
      {
        error:
          `Pinata upload failed (${pinataRes.status}).${hint} ` +
          `Details: ${upstreamBody}` +
          (requestId ? ` (request id: ${requestId})` : ""),
      },
      { status: pinataRes.status }
    );
  }

  let data: unknown;
  try {
    data = await pinataRes.json();
  } catch {
    return NextResponse.json(
      { error: "Pinata returned a non-JSON success response." },
      { status: 502 }
    );
  }

  const ipfsHash = (data as { IpfsHash?: unknown }).IpfsHash;
  if (typeof ipfsHash !== "string" || !ipfsHash.trim()) {
    return NextResponse.json(
      { error: "Pinata success response missing IpfsHash." },
      { status: 502 }
    );
  }

  return NextResponse.json({ cid: ipfsHash });
}
