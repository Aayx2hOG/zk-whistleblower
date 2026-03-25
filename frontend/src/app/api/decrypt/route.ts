import { NextRequest, NextResponse } from "next/server";
import {
  decryptReportWithOrgPrivateKey,
  type EncryptedBlob,
  type PublicKeyEncryptedBlob,
} from "@/lib/encryption";
import { getOrgPrivateKeyConfig } from "@/lib/orgKeys";

export const runtime = "nodejs";

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

function isV2Blob(blob: EncryptedBlob): blob is PublicKeyEncryptedBlob {
  return (
    (blob as PublicKeyEncryptedBlob).v === 2 &&
    typeof (blob as PublicKeyEncryptedBlob).wrappedKey === "string" &&
    typeof (blob as PublicKeyEncryptedBlob).ciphertext === "string" &&
    typeof (blob as PublicKeyEncryptedBlob).nonce === "string"
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { cid?: string; orgId?: number };
    if (typeof body.cid !== "string" || !body.cid.trim()) {
      return NextResponse.json({ error: "Missing CID" }, { status: 400 });
    }

    const orgId = Number(body.orgId ?? 0);
    if (!Number.isFinite(orgId) || orgId < 0) {
      return NextResponse.json({ error: "Invalid orgId" }, { status: 400 });
    }

    const cid = normalizeCid(body.cid);
    if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/.test(cid)) {
      return NextResponse.json({ error: "Invalid CID format" }, { status: 400 });
    }

    const ipfsRes = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`);
    if (!ipfsRes.ok) {
      return NextResponse.json(
        { error: `IPFS fetch failed (${ipfsRes.status}): ${ipfsRes.statusText}` },
        { status: 502 }
      );
    }

    const blob = (await ipfsRes.json()) as EncryptedBlob;
    if (!isV2Blob(blob)) {
      return NextResponse.json(
        {
          error:
            "This report uses legacy password encryption (v1). Public-key decryption supports v2 reports only.",
        },
        { status: 400 }
      );
    }

    const { keyB64 } = getOrgPrivateKeyConfig(orgId);
    const plaintext = await decryptReportWithOrgPrivateKey(blob, keyB64);
    return NextResponse.json({ plaintext });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to decrypt report";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}