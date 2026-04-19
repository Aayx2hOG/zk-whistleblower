"use client";

import { Icon, AdminGate } from "@zk-whistleblower/ui";

import { useCallback, useEffect, useState } from "react";
import {
  useReadContract,
  usePublicClient,
  useWatchContractEvent,
} from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@zk-whistleblower/shared/src/contracts";
import { useOrg } from "@zk-whistleblower/ui";

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

interface FileInfo {
  index: number;
  filename: string;
  mimeType: string;
  originalSize: number;
}

function ReportCard({ report, orgId, reviewerKey }: { report: Report; orgId: number; reviewerKey: string }) {
  const date = new Date(Number(report.timestamp) * 1000).toLocaleString();

  const [decryptStatus, setDecryptStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [decryptedText, setDecryptedText] = useState("");
  const [decryptError, setDecryptError] = useState("");
  const [fileList, setFileList] = useState<FileInfo[]>([]);
  const [downloadingFile, setDownloadingFile] = useState<number | null>(null);

  const buildHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (reviewerKey.trim()) {
      headers["x-api-key"] = reviewerKey.trim();
    }
    return headers;
  }, [reviewerKey]);

  const handleDecrypt = useCallback(async () => {
    setDecryptError("");
    setDecryptStatus("working");
    try {
      const res = await fetch("/api/decrypt", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ cid: report.encryptedCID, orgId }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        plaintext?: string;
        error?: string;
        manifest?: boolean;
        files?: FileInfo[];
      };
      if (!res.ok || typeof data.plaintext !== "string") {
        throw new Error(data.error || `Decrypt failed (${res.status})`);
      }

      setDecryptedText(data.plaintext);
      if (data.manifest && Array.isArray(data.files)) {
        setFileList(data.files);
      }
      setDecryptStatus("done");
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      setDecryptError(mapDecryptError(message));
      setDecryptStatus("error");
    }
  }, [report.encryptedCID, orgId, buildHeaders]);

  const handleDownloadFile = useCallback(async (fileIndex: number, filename: string) => {
    setDownloadingFile(fileIndex);
    try {
      const res = await fetch("/api/decrypt", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ cid: report.encryptedCID, orgId, fileIndex }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        base64?: string;
        filename?: string;
        mimeType?: string;
        error?: string;
      };
      if (!res.ok || !data.base64) {
        throw new Error(data.error || "File download failed");
      }

      // Convert base64 to blob and trigger download
      const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: data.mimeType || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename || filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setDecryptError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadingFile(null);
    }
  }, [report.encryptedCID, orgId, buildHeaders]);

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
          disabled={!reviewerKey.trim() || decryptStatus === "working" || decryptStatus === "done"}
        >
          {!reviewerKey.trim()
            ? "Submit key first"
            : decryptStatus === "working"
              ? "Decrypting…"
              : decryptStatus === "done"
                ? "Decrypted ✓"
                : "Decrypt"}
        </button>
        {!reviewerKey.trim() && (
          <p className="text-[10px] font-mono text-slate-500">
            Submit your reviewer key above to enable decryption.
          </p>
        )}
        {decryptStatus === "done" && (
          <div className="space-y-3">
            <div className="bg-black/40 border border-green-500/30 p-3 text-xs font-mono text-green-300 whitespace-pre-wrap break-words">
              {decryptedText}
            </div>

            {/* File attachments */}
            {fileList.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                  Attached files ({fileList.length})
                </p>
                {fileList.map((f) => (
                  <div
                    key={f.index}
                    className="flex items-center gap-3 bg-white/5 border border-white/10 px-3 py-2"
                  >
                    <span className="text-xs font-mono text-slate-300 truncate flex-1">
                      {f.filename}
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {(f.originalSize / 1024).toFixed(0)} KB · {f.mimeType}
                    </span>
                    <button
                      className="btn-ghost text-[10px] px-3 py-1 shrink-0"
                      onClick={() => handleDownloadFile(f.index, f.filename)}
                      disabled={downloadingFile !== null}
                    >
                      {downloadingFile === f.index ? "Decrypting…" : "Download"}
                    </button>
                  </div>
                ))}
              </div>
            )}
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
  const [reviewerKeyInput, setReviewerKeyInput] = useState("");
  const [reviewerKey, setReviewerKey] = useState("");
  const [reviewerKeyTouchedAfterSubmit, setReviewerKeyTouchedAfterSubmit] = useState(false);

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
    <AdminGate>
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

      {/* Reviewer authentication */}
      <section className="card space-y-3">
        <div>
          <p className="step-label">AUTHENTICATION</p>
          <h2 className="section-heading">Reviewer Access</h2>
        </div>
        <label className="label">Reviewer API Key</label>
        <input
          className="input font-mono text-xs"
          type="password"
          placeholder="Enter your reviewer API key to decrypt reports"
          value={reviewerKeyInput}
          onChange={(e) => {
            const next = e.target.value;
            setReviewerKeyInput(next);
            setReviewerKeyTouchedAfterSubmit(next.trim() !== reviewerKey.trim());
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-ghost text-xs px-4 py-2"
            onClick={() => {
              const normalizedKey = reviewerKeyInput.trim();
              setReviewerKey(normalizedKey);
              setReviewerKeyInput(normalizedKey);
              setReviewerKeyTouchedAfterSubmit(false);
            }}
            disabled={!reviewerKeyInput.trim()}
          >
            {reviewerKey ? "Update key" : "Submit key"}
          </button>
          {reviewerKey && (
            <button
              className="btn-ghost text-xs px-4 py-2"
              onClick={() => {
                setReviewerKey("");
                setReviewerKeyInput("");
                setReviewerKeyTouchedAfterSubmit(false);
              }}
            >
              Clear key
            </button>
          )}
        </div>
        {!reviewerKey && (
          <p className="text-[10px] font-mono text-slate-500">
            Submit your reviewer key before decrypting reports.
          </p>
        )}
        {reviewerKey && !reviewerKeyTouchedAfterSubmit && (
          <p className="text-[10px] font-mono text-green-400">
            Key submitted. You can now decrypt reports.
          </p>
        )}
        {reviewerKeyTouchedAfterSubmit && (
          <p className="text-[10px] font-mono text-yellow-400">
            Key input changed. Click update key to apply it.
          </p>
        )}
        <p className="text-[10px] font-mono text-slate-600">
          This key is never stored — it lives only in memory while this page is open.
          Contact your org admin if you don't have one.
        </p>
      </section>

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
          <ReportCard key={r.id.toString()} report={r} orgId={selectedOrgId} reviewerKey={reviewerKey} />
        ))}
      </div>

      {reports.length > 0 && (
        <p className="text-center text-[10px] font-mono text-slate-500 uppercase tracking-widest">
          Reports are end-to-end encrypted. Only authorised reviewers can
          decrypt the IPFS evidence.
        </p>
      )}
    </div>
    </AdminGate>
  );
}
