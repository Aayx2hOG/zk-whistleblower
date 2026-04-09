interface OrgKeyConfig {
  keyB64: string;
  keyVersion: number;
}

function parseNumericKeyMap(raw: string | undefined): Record<number, string> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<number, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const orgId = Number(k);
      if (!Number.isFinite(orgId) || orgId < 0) continue;
      if (typeof v !== "string" || !v.trim()) continue;
      out[Math.floor(orgId)] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function parseNumericVersionMap(raw: string | undefined): Record<number, number> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, number | string>;
    const out: Record<number, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      const orgId = Number(k);
      const version = Number(v);
      if (!Number.isFinite(orgId) || orgId < 0) continue;
      if (!Number.isFinite(version) || version <= 0) continue;
      out[Math.floor(orgId)] = Math.floor(version);
    }
    return out;
  } catch {
    return {};
  }
}

export function getOrgPublicKeyConfig(orgId: number): OrgKeyConfig {
  const perOrg = parseNumericKeyMap(process.env.NEXT_PUBLIC_ORG_RSA_PUBLIC_KEYS_JSON);
  const versions = parseNumericVersionMap(process.env.NEXT_PUBLIC_ORG_KEY_VERSIONS_JSON);

  const keyB64 = perOrg[orgId] ?? process.env.NEXT_PUBLIC_REPORT_RSA_PUBLIC_KEY_B64?.trim() ?? "";
  if (!keyB64) {
    throw new Error(
      "Missing org public key. Set NEXT_PUBLIC_ORG_RSA_PUBLIC_KEYS_JSON or NEXT_PUBLIC_REPORT_RSA_PUBLIC_KEY_B64."
    );
  }

  const keyVersion = versions[orgId] ?? Number(process.env.NEXT_PUBLIC_REPORT_RSA_KEY_VERSION ?? "1");
  return {
    keyB64,
    keyVersion: Number.isFinite(keyVersion) && keyVersion > 0 ? Math.floor(keyVersion) : 1,
  };
}

export function getOrgPrivateKeyConfig(orgId: number): OrgKeyConfig {
  const perOrg = parseNumericKeyMap(process.env.ORG_RSA_PRIVATE_KEYS_JSON);
  const versions = parseNumericVersionMap(process.env.ORG_RSA_KEY_VERSIONS_JSON);

  const keyB64 = perOrg[orgId] ?? process.env.REPORT_RSA_PRIVATE_KEY_B64?.trim() ?? "";
  if (!keyB64) {
    throw new Error(
      "Missing org private key. Set ORG_RSA_PRIVATE_KEYS_JSON or REPORT_RSA_PRIVATE_KEY_B64."
    );
  }

  const keyVersion = versions[orgId] ?? Number(process.env.REPORT_RSA_KEY_VERSION ?? "1");
  return {
    keyB64,
    keyVersion: Number.isFinite(keyVersion) && keyVersion > 0 ? Math.floor(keyVersion) : 1,
  };
}