"use client";

import { Icon, AdminGate } from "@zk-whistleblower/ui";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReadContract,
  usePublicClient,
  useWatchContractEvent,
  useAccount,
} from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@zk-whistleblower/shared/src/contracts";
import { useOrg } from "@zk-whistleblower/ui";
import {
  getLeagues,
  getLeagueMembers,
  type League,
} from "@zk-whistleblower/shared/src/leagueStore";

// types
interface Report {
  id: bigint;
  nullifierHash: bigint;
  encryptedCID: string; // normalized to plain CID text
  timestamp: bigint;
  category: number;
  merkleRoot: bigint;
}

interface RecipientInfo {
  id: string;
  name: string;
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

function RecipientBadge({ name }: { name: string }) {
  return (
    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-purple-500/20 text-purple-300 border border-purple-500/30">
      → {name}
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

function ReportCard({
  report,
  orgId,
  reviewerKey,
  recipient,
  canDecrypt,
}: {
  report: Report;
  orgId: number;
  reviewerKey: string;
  recipient: RecipientInfo | null | undefined; // null = general, undefined = not yet resolved
  canDecrypt: boolean;
}) {
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
    if (!canDecrypt) return;
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
        recipient?: { id: string; name: string };
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
  }, [report.encryptedCID, orgId, buildHeaders, canDecrypt]);

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
    <div className={`card space-y-3 ${!canDecrypt ? 'opacity-40 pointer-events-none grayscale' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
          Report #{report.id.toString()}
        </span>
        <div className="flex items-center gap-2">
          {recipient && <RecipientBadge name={recipient.name} />}
          {recipient === null && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-white/5 text-slate-500 border border-white/10">
              General
            </span>
          )}
          <CategoryBadge category={report.category} />
        </div>
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
      {canDecrypt ? (
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
      ) : (
        <div className="border-t border-white/10 pt-3">
          <p className="text-[10px] font-mono text-red-400/60 flex items-center gap-2">
            <Icon name="lock" className="text-sm" />
            This report is directed to a different department. You do not have access.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Fetch IPFS manifest to extract recipient (unencrypted) ───
async function fetchRecipientFromIPFS(cid: string): Promise<RecipientInfo | null> {
  try {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${cid}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Only manifests have the recipient field
    if (data?.type === "manifest" && data?.recipient?.name) {
      return { id: data.recipient.id, name: data.recipient.name };
    }
    // It's a manifest but no recipient specified = general
    if (data?.type === "manifest") return null;
    // It's not a manifest (direct encrypted blob) = general
    return null;
  } catch {
    return null;
  }
}

// ─── Filter logic ───
type FilterMode = "mine" | "all" | string; // string = specific league id

//review page
export default function ReviewerPage() {
  const { selectedOrgId } = useOrg();
  const publicClient = usePublicClient();
  const { address: connectedAddress } = useAccount();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewerKeyInput, setReviewerKeyInput] = useState("");
  const [reviewerKey, setReviewerKey] = useState("");
  const [reviewerKeyTouchedAfterSubmit, setReviewerKeyTouchedAfterSubmit] = useState(false);

  // Recipient metadata per report (fetched from IPFS)
  const [recipientMap, setRecipientMap] = useState<Record<string, RecipientInfo | null>>({});
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const fetchedCids = useRef<Set<string>>(new Set());

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>("mine");

  // ─── Detect current admin's league ───
  const leagues = useMemo(() => getLeagues(selectedOrgId), [selectedOrgId]);
  const myLeague = useMemo<League | null>(() => {
    if (!connectedAddress) return null;
    const members = getLeagueMembers(selectedOrgId);
    const myMembership = members.find(
      (m) => m.address.toLowerCase() === connectedAddress.toLowerCase()
    );
    if (!myMembership) return null;
    return leagues.find((l) => l.id === myMembership.leagueId) ?? null;
  }, [connectedAddress, selectedOrgId, leagues]);

  const isSuperAdmin = !myLeague; // not assigned to any league = super admin / sees all

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

  // ─── Fetch reports from chain ───
  useEffect(() => {
    if (countLoading) {
      setLoading(true);
      return;
    }

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

  // ─── Auto-fetch IPFS manifests to extract recipient metadata ───
  useEffect(() => {
    if (reports.length === 0) return;

    const unfetched = reports.filter((r) => !fetchedCids.current.has(r.encryptedCID));
    if (unfetched.length === 0) return;

    setRecipientsLoading(true);
    const controller = new AbortController();

    (async () => {
      const results: Record<string, RecipientInfo | null> = {};
      // Batch in groups of 5 to avoid hammering the gateway
      for (let i = 0; i < unfetched.length; i += 5) {
        const batch = unfetched.slice(i, i + 5);
        const batchResults = await Promise.allSettled(
          batch.map((r) => fetchRecipientFromIPFS(r.encryptedCID))
        );
        batch.forEach((r, j) => {
          fetchedCids.current.add(r.encryptedCID);
          const result = batchResults[j];
          results[r.id.toString()] = result.status === "fulfilled" ? result.value : null;
        });
      }
      if (!controller.signal.aborted) {
        setRecipientMap((prev) => ({ ...prev, ...results }));
        setRecipientsLoading(false);
      }
    })();

    return () => controller.abort();
  }, [reports]);

  // ─── Real-time report watcher ───
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

  // ─── Filtering logic ───
  const filteredReports = useMemo(() => {
    if (filterMode === "all") return reports;
    if (filterMode === "mine") {
      if (isSuperAdmin) return reports; // super admin sees everything in "mine"
      return reports.filter((r) => {
        const recipient = recipientMap[r.id.toString()];
        // Show if: directed to my league OR general (no recipient)
        if (recipient === undefined) return true; // not yet resolved, show it
        if (recipient === null) return true; // general report
        return myLeague && recipient.id === myLeague.id;
      });
    }
    // Specific league filter
    return reports.filter((r) => {
      const recipient = recipientMap[r.id.toString()];
      if (recipient === undefined) return false;
      if (recipient === null) return filterMode === "__general__";
      return recipient.id === filterMode;
    });
  }, [reports, filterMode, recipientMap, isSuperAdmin, myLeague]);

  // Determine if admin can decrypt a specific report
  const canDecryptReport = useCallback((report: Report): boolean => {
    if (isSuperAdmin) return true; // super admin can decrypt all
    const recipient = recipientMap[report.id.toString()];
    if (recipient === undefined) return true; // not yet resolved, allow
    if (recipient === null) return true; // general reports
    return myLeague !== null && recipient.id === myLeague.id;
  }, [recipientMap, isSuperAdmin, myLeague]);

  // Unique recipient leagues found across reports
  const discoveredLeagues = useMemo(() => {
    const seen = new Map<string, string>();
    let hasGeneral = false;
    Object.values(recipientMap).forEach((r) => {
      if (r === null) hasGeneral = true;
      else if (r) seen.set(r.id, r.name);
    });
    return { leagues: Array.from(seen.entries()).map(([id, name]) => ({ id, name })), hasGeneral };
  }, [recipientMap]);

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
          <div className="flex items-center gap-3 mt-2">
            <p className="text-slate-500 text-xs font-mono tracking-tight">
              Active org: {selectedOrgId}
            </p>
            {myLeague ? (
              <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-purple-500 text-black">
                {myLeague.name}
              </span>
            ) : (
              <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-white text-black">
                Super Admin
              </span>
            )}
          </div>
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

      {/* ── Filter tabs ── */}
      {reports.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mr-2">Filter:</p>
            
            <button
              className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                filterMode === "mine"
                  ? "bg-white text-black"
                  : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
              }`}
              onClick={() => setFilterMode("mine")}
            >
              {myLeague ? `My Reports (${myLeague.name})` : "All Reports"}
            </button>

            {isSuperAdmin && discoveredLeagues.leagues.length > 0 && (
              <>
                {discoveredLeagues.hasGeneral && (
                  <button
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      filterMode === "__general__"
                        ? "bg-white text-black"
                        : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
                    }`}
                    onClick={() => setFilterMode("__general__")}
                  >
                    General
                  </button>
                )}
                {discoveredLeagues.leagues.map((l) => (
                  <button
                    key={l.id}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                      filterMode === l.id
                        ? "bg-purple-500 text-black"
                        : "bg-purple-500/10 text-purple-300 border border-purple-500/20 hover:bg-purple-500/20"
                    }`}
                    onClick={() => setFilterMode(l.id)}
                  >
                    {l.name}
                  </button>
                ))}
                <button
                  className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                    filterMode === "all"
                      ? "bg-white text-black"
                      : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
                  }`}
                  onClick={() => setFilterMode("all")}
                >
                  All
                </button>
              </>
            )}
          </div>

          {recipientsLoading && (
            <p className="text-[9px] font-mono text-slate-600 animate-pulse">
              Resolving report routing metadata…
            </p>
          )}

          <p className="text-[10px] font-mono text-slate-600">
            Showing {filteredReports.length} of {reports.length} reports
          </p>
        </section>
      )}

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

      {!loading && reports.length > 0 && filteredReports.length === 0 && (
        <div className="card text-center text-slate-500 space-y-2">
          <Icon name="inbox" className="text-4xl text-white/20 block mx-auto" />
          <p className="text-sm">No reports match your current filter.</p>
          {!isSuperAdmin && myLeague && (
            <p className="text-[10px] font-mono text-slate-600">
              You are viewing reports for <strong className="text-purple-400">{myLeague.name}</strong>.
              No reports have been directed to your department yet.
            </p>
          )}
        </div>
      )}

      <div className="space-y-4">
        {[...filteredReports].reverse().map((r) => (
          <ReportCard
            key={r.id.toString()}
            report={r}
            orgId={selectedOrgId}
            reviewerKey={reviewerKey}
            recipient={recipientMap[r.id.toString()]}
            canDecrypt={canDecryptReport(r)}
          />
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
