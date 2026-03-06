"use client";

import { useState, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useAccount,
} from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { initPoseidon, poseidonHash } from "@/lib/poseidon";
import { buildMerkleTree } from "@/lib/merkle";

// ─── Types ────────────────────────────────────────────────────────────────────
interface RootEvent {
  root: bigint;
  type: "added" | "revoked";
  blockNumber?: bigint;
}

// ─── Small reusable status component ────────────────────────────────────────
function TxStatus({
  hash,
  label,
}: {
  hash?: `0x${string}`;
  label: string;
}) {
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  if (!hash) return null;
  return (
    <p className="mt-2 text-xs">
      {isLoading && <span className="text-yellow-400">⏳ {label}…</span>}
      {isSuccess && <span className="text-brand-500">✓ Confirmed!</span>}
    </p>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const { isConnected } = useAccount();

  // ── Build-tree state ──
  const [secretsInput, setSecretsInput] = useState<string>("");
  const [builtRoot, setBuiltRoot] = useState<string>("");
  const [buildError, setBuildError] = useState<string>("");
  const [building, setBuilding] = useState(false);

  // ── Add-root state ──
  const [addRootInput, setAddRootInput] = useState<string>("");
  const {
    writeContract: addRoot,
    data: addHash,
    isPending: addPending,
    error: addError,
  } = useWriteContract();

  // ── Revoke-root state ──
  const [revokeInput, setRevokeInput] = useState<string>("");
  const {
    writeContract: revokeRoot,
    data: revokeHash,
    isPending: revokePending,
    error: revokeError,
  } = useWriteContract();

  // ── Live event log ──
  const [events, setEvents] = useState<RootEvent[]>([]);

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "RootAdded",
    onLogs(logs) {
      logs.forEach((log) => {
        if ("args" in log && log.args)
          setEvents((e) => [
            { root: (log.args as { root: bigint }).root, type: "added" },
            ...e,
          ]);
      });
    },
  });

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "RootRevoked",
    onLogs(logs) {
      logs.forEach((log) => {
        if ("args" in log && log.args)
          setEvents((e) => [
            { root: (log.args as { root: bigint }).root, type: "revoked" },
            ...e,
          ]);
      });
    },
  });

  // ── Handlers ──

  const handleBuildTree = useCallback(async () => {
    setBuildError("");
    setBuiltRoot("");
    setBuilding(true);
    try {
      await initPoseidon();
      const lines = secretsInput
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!lines.length) throw new Error("Enter at least one secret");
      const secrets = lines.map((s) => {
        const n = BigInt(s);
        if (n < 0n) throw new Error(`Negative secret: ${s}`);
        return n;
      });
      const commitments = secrets.map((s) => poseidonHash([s]));
      const { root } = buildMerkleTree(commitments);
      setBuiltRoot(root.toString());
      setAddRootInput(root.toString());
    } catch (e: unknown) {
      setBuildError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  }, [secretsInput]);

  const handleAddRoot = () => {
    if (!addRootInput) return;
    addRoot({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: "addRoot",
      args: [BigInt(addRootInput)],
    });
  };

  const handleRevokeRoot = () => {
    if (!revokeInput) return;
    revokeRoot({
      address: REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: "revokeRoot",
      args: [BigInt(revokeInput)],
    });
  };

  if (!isConnected) {
    return (
      <div className="card text-center text-slate-400">
        <span className="material-symbols-outlined text-4xl text-white/20 mb-4 block">admin_panel_settings</span>
        Connect your wallet to manage Merkle roots.
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <div className="mb-8">
        <h1 className="text-white text-4xl font-black leading-none tracking-tighter mb-3 uppercase italic">
          Admin Panel
        </h1>
        <div className="flex items-center gap-4">
          <span className="px-2 py-1 bg-green-500 text-black text-[10px] font-bold uppercase tracking-widest">
            Owner Access
          </span>
          <p className="text-slate-500 text-sm font-mono tracking-tight">
            Merkle Root Management // On-Chain Registry
          </p>
        </div>
      </div>

      {/* ── Step 1: Build Tree ─────────────────────────────────────────── */}
      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">01_TREE_CONSTRUCTION</p>
            <h2 className="section-heading">Build Merkle Tree</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">account_tree</span>
        </div>
        <p className="text-xs text-slate-500 font-mono">
          Enter one secret per line. Each secret is hashed via Poseidon and
          assembled into a binary Merkle tree locally.
        </p>
        <div>
          <label className="label">Member secrets</label>
          <textarea
            className="input h-28 resize-none font-mono text-xs"
            placeholder={"123456789\n987654321\n555555555"}
            value={secretsInput}
            onChange={(e) => setSecretsInput(e.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleBuildTree}
          disabled={building || !secretsInput.trim()}
        >
          {building ? "Building…" : "Build Tree"}
        </button>
        {buildError && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {buildError}
          </p>
        )}
        {builtRoot && (
          <div className="bg-white/5 border border-white/10 p-4">
            <p className="text-[10px] font-mono text-slate-400 mb-2">COMPUTED_MERKLE_ROOT</p>
            <p className="break-all font-mono text-xs text-white">
              {builtRoot}
            </p>
            <p className="mt-2 text-[10px] font-mono text-slate-500">
              ↳ Automatically filled into the Add Root field below.
            </p>
          </div>
        )}
      </section>

      {/* ── Step 2: Add Root ───────────────────────────────────────────── */}
      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">02_REGISTRATION</p>
            <h2 className="section-heading">Register Root On-Chain</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">add_circle</span>
        </div>
        <div>
          <label className="label">Merkle root (decimal)</label>
          <input
            className="input font-mono text-xs"
            placeholder="Paste root value or build from Step 1"
            value={addRootInput}
            onChange={(e) => setAddRootInput(e.target.value)}
          />
        </div>
        <button
          className="btn-primary"
          onClick={handleAddRoot}
          disabled={addPending || !addRootInput}
        >
          {addPending ? "Submitting…" : "Add Root"}
        </button>
        <TxStatus hash={addHash} label="Adding root" />
        {addError && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {addError.message}
          </p>
        )}
      </section>

      {/* ── Revoke Root ────────────────────────────────────────────────── */}
      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">03_REVOCATION</p>
            <h2 className="section-heading">Revoke A Root</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">delete_forever</span>
        </div>
        <div>
          <label className="label">Root to revoke (decimal)</label>
          <input
            className="input font-mono text-xs"
            placeholder="Enter the root value"
            value={revokeInput}
            onChange={(e) => setRevokeInput(e.target.value)}
          />
        </div>
        <button
          className="btn-danger"
          onClick={handleRevokeRoot}
          disabled={revokePending || !revokeInput}
        >
          {revokePending ? "Submitting…" : "Revoke Root"}
        </button>
        <TxStatus hash={revokeHash} label="Revoking root" />
        {revokeError && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {revokeError.message}
          </p>
        )}
      </section>

      {/* ── Live Event Log ─────────────────────────────────────────────── */}
      {events.length > 0 && (
        <section className="card space-y-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="step-label">LIVE_FEED</p>
              <h2 className="section-heading">Root Events</h2>
            </div>
            <span className="material-symbols-outlined text-white/20">monitoring</span>
          </div>
          <ul className="space-y-2">
            {events.map((ev, i) => (
              <li
                key={i}
                className="flex items-start gap-3 bg-white/5 border border-white/10 p-3 text-xs"
              >
                <span
                  className={
                    ev.type === "added" ? "text-green-400 font-bold" : "text-red-400 font-bold"
                  }
                >
                  {ev.type === "added" ? "✓ ADDED" : "✗ REVOKED"}
                </span>
                <span className="break-all font-mono text-slate-400">
                  {ev.root.toString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
