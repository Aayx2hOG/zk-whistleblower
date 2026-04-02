"use client";

import Icon from "@/components/Icon";

import { useCallback, useEffect, useState } from "react";
import {
  useReadContract,
  usePublicClient,
  useWatchContractEvent,
} from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@/lib/contracts";
import { useOrg } from "@/providers/OrgProvider";

// types
interface Report {
  id: bigint;
  nullifierHash: bigint;
  encryptedCID: string; // normalized to plain CID text
  timestamp: bigint;
  category: number;
  merkleRoot: bigint;
}

function decodeCid(value: Uint8Array | string): string {
  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value).replace(/\u0000+$/g, "");
  }

  const raw = value.trim();
  // Some providers return bytes as 0x-prefixed hex strings; decode to UTF-8 CID.
  if (/^0x[0-9a-fA-F]*$/.test(raw) && raw.length >= 4) {
    try {
      const hex = raw.slice(2);
      const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map((b) => parseInt(b, 16)) ?? []);
      const decoded = new TextDecoder().decode(bytes).replace(/\u0000+$/g, "").trim();
      return decoded || raw;
    } catch {
      return raw;
    }
  }

  return raw;
}

//badge
const CATEGORY_COLORS = [
  "bg-red-500/20 text-red-300 border border-red-500/30",
  "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  "bg-white/10 text-slate-300 border border-white/20",
];

function CategoryBadge({ category }: { category: number }) {
  return (
    <span
      className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest ${CATEGORY_COLORS[category] ?? CATEGORY_COLORS[3]}`}
    >
      {CATEGORIES[category] ?? "Unknown"}
    </span>
  );
}

function mapDecryptError(message: string): string {
  if (message.includes("legacy password encryption") || message.includes("v1")) {
    return "This report was encrypted with legacy password mode (v1). It cannot be decrypted with org key-pair mode. Ask for legacy password only for this historical report, or re-submit using v2 key-pair encryption.";
  }
  return message;
}

//report card
function ReportCard({ report, orgId }: { report: Report; orgId: number }) {
  const date = new Date(Number(report.timestamp) * 1000).toLocaleString();

  const [decryptStatus, setDecryptStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [decryptedText, setDecryptedText] = useState("");
  const [decryptError, setDecryptError] = useState("");

  const handleDecrypt = useCallback(async () => {
    setDecryptError("");
    setDecryptStatus("working");
    try {
      const res = await fetch("/api/decrypt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cid: report.encryptedCID, orgId }),
      });

      const data = (await res.json().catch(() => ({}))) as { plaintext?: string; error?: string };
      if (!res.ok || typeof data.plaintext !== "string") {
        throw new Error(data.error || `Decrypt failed (${res.status})`);
      }

      const plaintext = data.plaintext;
      setDecryptedText(plaintext);
      setDecryptStatus("done");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setDecryptError(mapDecryptError(message));
      setDecryptStatus("error");
    }
  }, [report.encryptedCID, orgId]);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
          Report #{report.id.toString()}
        </span>
        <CategoryBadge category={report.category} />
      </div>
      <div className="space-y-2 font-mono text-xs text-slate-400">
        <p>
          <span className="text-slate-500">ENCRYPTED_CID: </span>
          {report.encryptedCID}
        </p>
        <p>
          <span className="text-slate-500">TIMESTAMP: </span>
          {date}
        </p>
        <p className="truncate">
          <span className="text-slate-500">NULLIFIER: </span>
          {report.nullifierHash.toString()}
        </p>
        <p className="truncate">
          <span className="text-slate-500">ROOT: </span>
          {report.merkleRoot.toString()}
        </p>
      </div>

      {/* Decrypt panel */}
      <div className="border-t border-white/10 pt-3 space-y-2">
        <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Decrypt report</p>
        <button
          className="btn-ghost text-xs px-4 py-2 shrink-0"
          onClick={handleDecrypt}
          disabled={decryptStatus === "working" || decryptStatus === "done"}
        >
          {decryptStatus === "working" ? "Decrypting…" : decryptStatus === "done" ? "Decrypted ✓" : "Decrypt"}
        </button>
        {decryptStatus === "done" && (
          <div className="bg-black/40 border border-green-500/30 p-3 text-xs font-mono text-green-300 whitespace-pre-wrap break-words">
            {decryptedText}
          </div>
        )}
        {decryptStatus === "error" && (
          <p className="text-[10px] font-mono text-red-400">{decryptError}</p>
        )}
      </div>
    </div>
  );
}

//review page
export default function ReviewerPage() {
  const { selectedOrgId } = useOrg();
  const publicClient = usePublicClient();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    data: reportCount,
    isLoading: countLoading,
    error: countError,
  } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "getOrgReportCount",
    args: [BigInt(selectedOrgId)],
  });

  useEffect(() => {
    // Still waiting for the count RPC call
    if (countLoading) {
      setLoading(true);
      return;
    }

    // Count RPC failed (wrong network, node not running, etc.)
    if (countError) {
      setError(
        `Could not reach contract: ${countError.message}. Is your local Hardhat node running and the wallet connected to localhost:8545?`
      );
      setLoading(false);
      return;
    }

    if (reportCount === undefined) {
      setLoading(false);
      return;
    }

    const count = Number(reportCount);
    if (count === 0) {
      setReports([]);
      setLoading(false);
      return;
    }

    if (!publicClient) {
      setError("No RPC client available — connect your wallet first.");
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const reportIdCalls = Array.from({ length: count }, (_, i) =>
          publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "getOrgReportIdAt",
            args: [BigInt(selectedOrgId), BigInt(i)],
          })
        );
        const reportIds = await Promise.all(reportIdCalls);

        const calls = reportIds.map((reportId) =>
          publicClient.readContract({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "getReport",
            args: [reportId],
          })
        );
        const results = await Promise.all(calls);
        const parsed: Report[] = results
          .filter(Boolean)
          .map((r: unknown, i) => {
            const row = r as {
              nullifierHash: bigint;
              encryptedCID: Uint8Array | string;
              timestamp: bigint;
              category: number;
              merkleRoot: bigint;
            };

            const cidString = decodeCid(row.encryptedCID);

            return {
              id: reportIds[i],
              nullifierHash: row.nullifierHash,
              encryptedCID: cidString,
              timestamp: row.timestamp,
              category: Number(row.category),
              merkleRoot: row.merkleRoot,
            };
          });
        setReports(parsed);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [reportCount, countLoading, countError, publicClient, selectedOrgId]);

  //real time report fetch
  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "ReportSubmittedForOrg",
    onLogs(logs) {

      logs.forEach((log) => {
        if (!("args" in log) || !log.args) return;
        const args = log.args as {
          reportId: bigint;
          orgId: bigint;
          nullifierHash: bigint;
          encryptedCID: Uint8Array | string;
          category: number;
          timestamp: bigint;
        };

        if (Number(args.orgId) !== selectedOrgId) return;

        const cidString = decodeCid(args.encryptedCID);

        const newReport: Report = {
          id: args.reportId,
          nullifierHash: args.nullifierHash,
          encryptedCID: cidString,
          timestamp: args.timestamp,
          category: Number(args.category),
          merkleRoot: 0n,
        };
        setReports((prev) => {
          if (prev.some((r) => r.id === newReport.id)) return prev;
          return [...prev, newReport];
        });
      });
    },
  });

  return (
    <div className="space-y-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white text-4xl font-black leading-none tracking-tighter mb-3 uppercase italic">
            Reviewer
          </h1>
          <div className="flex items-center gap-4">
            <span className="px-2 py-1 bg-green-500 text-black text-[10px] font-bold uppercase tracking-widest">
              Live Feed
            </span>
            <p className="text-slate-500 text-sm font-mono tracking-tight">
              On-chain whistleblower reports // Real-time updates
            </p>
          </div>
          <p className="text-slate-500 text-xs font-mono tracking-tight mt-2">
            Active org: {selectedOrgId}
          </p>
        </div>
        <div className="border border-white/10 bg-white/5 p-4 text-center">
          <p className="text-2xl font-black text-white">
            {reportCount?.toString() ?? "—"}
          </p>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Reports</p>
        </div>
      </div>

      {loading && (
        <div className="card animate-pulse text-center text-slate-500 font-mono text-sm">
          LOADING_REPORTS...
        </div>
      )}

      {error && (
        <div className="card bg-red-900/20 border-red-500/30 text-sm text-red-400">{error}</div>
      )}

      {!loading && reports.length === 0 && !error && (
        <div className="card text-center text-slate-500">
          <Icon name="inbox" className="text-4xl text-white/20 mb-4 block" />
          No reports submitted yet. Be the first whistleblower.
        </div>
      )}

      <div className="space-y-4">
        {[...reports].reverse().map((r) => (
          <ReportCard key={r.id.toString()} report={r} orgId={selectedOrgId} />
        ))}
      </div>

      {reports.length > 0 && (
        <p className="text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          Reports are end-to-end encrypted. Only authorised reviewers can
          decrypt the IPFS evidence.
        </p>
      )}
    </div>
  );
}
