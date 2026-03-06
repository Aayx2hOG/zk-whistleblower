"use client";

import { useEffect, useState } from "react";
import {
  useReadContract,
  usePublicClient,
  useWatchContractEvent,
} from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS, CATEGORIES } from "@/lib/contracts";

// types
interface Report {
  id: bigint;
  nullifierHash: bigint;
  encryptedCID: string;
  timestamp: bigint;
  category: number;
  merkleRoot: bigint;
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

//report card
function ReportCard({ report }: { report: Report }) {
  const date = new Date(Number(report.timestamp) * 1000).toLocaleString();
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
    </div>
  );
}

//review page
export default function ReviewerPage() {
  const publicClient = usePublicClient();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");


  const { data: reportCount } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "getReportCount",
  });


  useEffect(() => {
    if (reportCount === undefined) return;

    const count = Number(reportCount);
    if (count === 0) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setError("");
      try {
        const calls = Array.from({ length: count }, (_, i) =>
          publicClient?.readContract({
            address: REGISTRY_ADDRESS,
            abi: REGISTRY_ABI,
            functionName: "getReport",
            args: [BigInt(i)],
          })
        );
        const results = await Promise.all(calls);
        const parsed: Report[] = results
          .filter(Boolean)
          .map((r: unknown, i) => {
            const row = r as {
              nullifierHash: bigint;
              encryptedCID: string;
              timestamp: bigint;
              category: number;
              merkleRoot: bigint;
            };
            return {
              id: BigInt(i),
              nullifierHash: row.nullifierHash,
              encryptedCID: row.encryptedCID,
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
  }, [reportCount, publicClient]);

//real time report fetch
  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "ReportSubmitted",
    onLogs(logs) {

      logs.forEach((log) => {
        if (!("args" in log) || !log.args) return;
        const args = log.args as {
          reportId: bigint;
          nullifierHash: bigint;
          encryptedCID: string;
          category: number;
          timestamp: bigint;
        };
        // will be updated on next full fetch
        const newReport: Report = {
          id: args.reportId,
          nullifierHash: args.nullifierHash,
          encryptedCID: args.encryptedCID,
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
          <span className="material-symbols-outlined text-4xl text-white/20 mb-4 block">inbox</span>
          No reports submitted yet. Be the first whistleblower.
        </div>
      )}

      <div className="space-y-4">
        {[...reports].reverse().map((r) => (
          <ReportCard key={r.id.toString()} report={r} />
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
