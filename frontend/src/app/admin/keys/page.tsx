"use client";

import { useMemo, useState } from "react";

interface OrgKeyRow {
  orgId: string;
  publicKeyB64: string;
  keyVersion: string;
}

function safeJsonParse(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function AdminKeysPage() {
  const [rows, setRows] = useState<OrgKeyRow[]>([
    { orgId: "0", publicKeyB64: "", keyVersion: "1" },
  ]);

  const [existingPublicMap, setExistingPublicMap] = useState("");
  const [existingVersionMap, setExistingVersionMap] = useState("");

  const publicMap = useMemo(() => {
    const merged = safeJsonParse(existingPublicMap);
    for (const row of rows) {
      const orgId = Number(row.orgId);
      if (!Number.isFinite(orgId) || orgId < 0) continue;
      if (!row.publicKeyB64.trim()) continue;
      merged[String(Math.floor(orgId))] = row.publicKeyB64.trim();
    }
    return JSON.stringify(merged);
  }, [existingPublicMap, rows]);

  const versionMap = useMemo(() => {
    const parsed = safeJsonParse(existingVersionMap);
    const merged: Record<string, number> = {};

    for (const [k, v] of Object.entries(parsed)) {
      const orgId = Number(k);
      const ver = Number(v);
      if (!Number.isFinite(orgId) || orgId < 0) continue;
      if (!Number.isFinite(ver) || ver <= 0) continue;
      merged[String(Math.floor(orgId))] = Math.floor(ver);
    }

    for (const row of rows) {
      const orgId = Number(row.orgId);
      const ver = Number(row.keyVersion);
      if (!Number.isFinite(orgId) || orgId < 0) continue;
      if (!Number.isFinite(ver) || ver <= 0) continue;
      merged[String(Math.floor(orgId))] = Math.floor(ver);
    }

    return JSON.stringify(merged);
  }, [existingVersionMap, rows]);

  const envSnippet = useMemo(
    () =>
      [
        `NEXT_PUBLIC_ORG_RSA_PUBLIC_KEYS_JSON=${publicMap}`,
        `NEXT_PUBLIC_ORG_KEY_VERSIONS_JSON=${versionMap}`,
      ].join("\n"),
    [publicMap, versionMap]
  );

  const updateRow = (index: number, key: keyof OrgKeyRow, value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [key]: value } : r)));
  };

  const addRow = () => {
    setRows((prev) => [...prev, { orgId: "", publicKeyB64: "", keyVersion: "1" }]);
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-white text-4xl font-black leading-none tracking-tighter mb-3 uppercase italic">
          Admin Key Manager
        </h1>
        <p className="text-slate-500 text-sm font-mono tracking-tight">
          Prepare per-org public key env values for report encryption and key rotation.
        </p>
      </div>

      <section className="card space-y-4">
        <p className="label">Optional existing JSON maps</p>
        <textarea
          className="input h-20 resize-none font-mono text-xs"
          placeholder='Existing NEXT_PUBLIC_ORG_RSA_PUBLIC_KEYS_JSON (optional)'
          value={existingPublicMap}
          onChange={(e) => setExistingPublicMap(e.target.value)}
        />
        <textarea
          className="input h-20 resize-none font-mono text-xs"
          placeholder='Existing NEXT_PUBLIC_ORG_KEY_VERSIONS_JSON (optional)'
          value={existingVersionMap}
          onChange={(e) => setExistingVersionMap(e.target.value)}
        />
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <p className="label">Add or rotate org public keys</p>
          <button className="btn-ghost text-xs px-3 py-2" onClick={addRow}>
            Add Row
          </button>
        </div>

        {rows.map((row, index) => (
          <div key={`${index}-${row.orgId}`} className="border border-white/10 bg-white/5 p-3 space-y-3">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="input font-mono text-xs"
                placeholder="Org ID"
                value={row.orgId}
                onChange={(e) => updateRow(index, "orgId", e.target.value)}
              />
              <input
                className="input font-mono text-xs"
                placeholder="Key version"
                value={row.keyVersion}
                onChange={(e) => updateRow(index, "keyVersion", e.target.value)}
              />
              <button
                className="btn-danger text-xs px-3 py-2"
                onClick={() => removeRow(index)}
                disabled={rows.length === 1}
              >
                Remove
              </button>
            </div>
            <textarea
              className="input h-24 resize-none font-mono text-xs"
              placeholder="SPKI public key (base64 DER)"
              value={row.publicKeyB64}
              onChange={(e) => updateRow(index, "publicKeyB64", e.target.value)}
            />
          </div>
        ))}
      </section>

      <section className="card space-y-4">
        <p className="label">Env snippet</p>
        <textarea className="input h-28 resize-none font-mono text-xs" value={envSnippet} readOnly />
        <p className="text-[10px] font-mono text-slate-500">
          Add matching private keys server-side with ORG_RSA_PRIVATE_KEYS_JSON and ORG_RSA_KEY_VERSIONS_JSON.
        </p>
      </section>
    </div>
  );
}
