"use client";

import { useState, useCallback, useRef } from "react";
import {
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  usePublicClient,
} from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@/lib/contracts";
import { relayAddRoot, relayRevokeRoot } from "@/lib/relayer";
import { initPoseidon, poseidonHash } from "@/lib/poseidon";
import { buildMerkleTree } from "@/lib/merkle";
import {
  generateSecret,
  encryptSecret,
  downloadJSON,
  type MemberKeyFile,
} from "@/lib/secretGen";
import { getDemoMembers } from "@/lib/demoOrg";


interface RootEvent {
  root: bigint;
  type: "added" | "revoked";
  blockNumber?: bigint;
}


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

// Main page 
export default function AdminPage() {
  const publicClient = usePublicClient();

  // Member registration types 
  interface MemberInput {
    id: string;
    password: string;
  }
  interface GeneratedMember {
    id: string;
    commitment: string;
    leafIndex: number;
    keyFile: MemberKeyFile;
  }

  // Member registration state
  const [members, setMembers] = useState<MemberInput[]>([{ id: "", password: "" }]);
  const [generated, setGenerated] = useState<GeneratedMember[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [demoRootMsg, setDemoRootMsg] = useState("");

  // Build tree output state (shared with step 2)
  const [builtRoot, setBuiltRoot] = useState<string>("");

  //Add root state 
  const [addRootInput, setAddRootInput] = useState<string>("");
  const [addHash, setAddHash] = useState<`0x${string}` | undefined>();
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState("");

  //Revoke root state
  const [revokeInput, setRevokeInput] = useState<string>("");
  const [revokeHash, setRevokeHash] = useState<`0x${string}` | undefined>();
  const [revokePending, setRevokePending] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  //Live event log
  const [events, setEvents] = useState<RootEvent[]>([]);
  const seenEvents = useRef<Set<string>>(new Set());

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "RootAdded",
    onLogs(logs) {
      logs.forEach((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seenEvents.current.has(key)) return;
        seenEvents.current.add(key);
        if ("args" in log && log.args)
          setEvents((e) => [
            { root: (log.args as { root: bigint }).root, type: "added", blockNumber: log.blockNumber },
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
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seenEvents.current.has(key)) return;
        seenEvents.current.add(key);
        if ("args" in log && log.args)
          setEvents((e) => [
            { root: (log.args as { root: bigint }).root, type: "revoked", blockNumber: log.blockNumber },
            ...e,
          ]);
      });
    },
  });

  //  Handlers

  //  Member list helpers 
  const handleAddMember = () =>
    setMembers((m) => [...m, { id: "", password: "" }]);

  const handleRemoveMember = (i: number) =>
    setMembers((m) => m.filter((_, idx) => idx !== i));

  const handleMemberChange = (
    i: number,
    field: "id" | "password",
    val: string
  ) =>
    setMembers((m) =>
      m.map((mem, idx) => (idx === i ? { ...mem, [field]: val } : mem))
    );

  //  Secret generation 
  const handleGenerateSecrets = useCallback(async () => {
    setGenError("");
    setGenerated([]);
    setBuiltRoot("");
    setGenerating(true);
    try {
      await initPoseidon();
      const results: GeneratedMember[] = [];
      for (const [idx, mem] of members.entries()) {
        if (!mem.id.trim())
          throw new Error(`Member at row ${idx + 1} has no ID`);
        const secret = generateSecret();
        const commitment = poseidonHash([secret]);
        // Fall back to member ID as password when none provided
        const pwd = mem.password.trim() || mem.id.trim();
        const encrypted = await encryptSecret(secret, pwd);
        results.push({
          id: mem.id.trim(),
          commitment: commitment.toString(),
          leafIndex: idx,
          keyFile: {
            memberId: mem.id.trim(),
            commitment: commitment.toString(),
            encrypted,
          },
        });
      }
      setGenerated(results);
      const commitments = results.map((r) => BigInt(r.commitment));
      const { root } = buildMerkleTree(commitments);
      setBuiltRoot(root.toString());
      setAddRootInput(root.toString());
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [members]);

  const handleDownloadKeyFile = (m: GeneratedMember) =>
    downloadJSON(m.keyFile, `${m.id}.json`);

  const handleDownloadManifest = () =>
    downloadJSON(
      {
        commitments: generated.map((m) => m.commitment),
        root: builtRoot,
        memberCount: generated.length,
        treeDepth: 10,
      },
      "manifest.json"
    );

  const handleLoadRootFromDemoJoin = useCallback(async () => {
    setDemoRootMsg("");
    setGenError("");

    try {
      await initPoseidon();
      const demoMembers = getDemoMembers();
      if (!demoMembers.length) {
        throw new Error("No demo members found. Add users on Join Org page first.");
      }

      const commitments = demoMembers.map((m) => BigInt(m.commitment));
      const { root } = buildMerkleTree(commitments);
      setBuiltRoot(root.toString());
      setAddRootInput(root.toString());
      setDemoRootMsg(`Loaded ${demoMembers.length} demo members and computed root.`);
    } catch (e: unknown) {
      setDemoRootMsg(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const handleAddRoot = async () => {
    if (!addRootInput) return;
    setAddError("");
    setAddPending(true);
    try {
      const { txHash } = await relayAddRoot(addRootInput.trim());
      setAddHash(txHash);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddPending(false);
    }
  };

  const handleRevokeRoot = async () => {
    if (!revokeInput) return;
    setRevokeError("");
    setRevokePending(true);
    try {
      const { txHash } = await relayRevokeRoot(revokeInput.trim());
      setRevokeHash(txHash);
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash: txHash });
      }
    } catch (e: unknown) {
      setRevokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokePending(false);
    }
  };

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


      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">01_MEMBER_REGISTRATION</p>
            <h2 className="section-heading">Generate Member Secrets</h2>
          </div>
          <span className="material-symbols-outlined text-white/20">group_add</span>
        </div>
        <p className="text-xs text-slate-500 font-mono">
          Add member IDs and optional passwords. A random cryptographic secret
          is generated for each member, encrypted with their password, and
          packaged into a downloadable key file. The Merkle root is computed
          from commitments and auto-filled below.
        </p>

        <div className="bg-white/[0.03] border border-white/10 p-4 space-y-3">
          <p className="label">Use Join Org demo list</p>
          <p className="text-[10px] font-mono text-slate-600">
            For the demo flow, compute root directly from members created on the Join Org page.
          </p>
          <button className="btn-ghost text-xs px-4 py-2" onClick={handleLoadRootFromDemoJoin}>
            Load Root From Join Org
          </button>
          {demoRootMsg && (
            <p className="text-[10px] font-mono text-slate-400">{demoRootMsg}</p>
          )}
        </div>

        {/* Member rows */}
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_2rem] gap-2 mb-1">
            <span className="label">Member ID</span>
            <span className="label">Password</span>
            <span />
          </div>
          {members.map((mem, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2rem] gap-2 items-center">
              <input
                className="input font-mono text-xs py-3"
                placeholder="e.g. alice"
                value={mem.id}
                onChange={(e) => handleMemberChange(i, "id", e.target.value)}
              />
              <input
                className="input font-mono text-xs py-3"
                type="password"
                placeholder="leave blank → use ID"
                value={mem.password}
                onChange={(e) =>
                  handleMemberChange(i, "password", e.target.value)
                }
              />
              <button
                className="text-red-500 hover:text-red-400 disabled:opacity-30 text-lg leading-none"
                onClick={() => handleRemoveMember(i)}
                disabled={members.length === 1}
                title="Remove member"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button className="btn-ghost flex-1" onClick={handleAddMember}>
            + Add Member
          </button>
          <button
            className="btn-primary flex-[2]"
            onClick={handleGenerateSecrets}
            disabled={generating || !members.some((m) => m.id.trim())}
          >
            {generating ? "Generating…" : "Generate Secrets"}
          </button>
        </div>

        {genError && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {genError}
          </p>
        )}

        {generated.length > 0 && (
          <>
            {/* Per-member results */}
            <div className="space-y-1">
              <p className="label">Generated members</p>
              {generated.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 p-3"
                >
                  <span className="font-mono text-xs text-white w-20 shrink-0 truncate">
                    #{m.leafIndex} {m.id}
                  </span>
                  <span className="font-mono text-xs text-slate-500 flex-1 truncate">
                    {m.commitment.slice(0, 22)}…
                  </span>
                  <button
                    className="btn-ghost text-xs py-1 px-3 shrink-0"
                    onClick={() => handleDownloadKeyFile(m)}
                  >
                    ↓ {m.id}.json
                  </button>
                </div>
              ))}
            </div>

            {/* Manifest + computed root */}
            <div className="flex gap-3">
              <button
                className="btn-ghost flex-1"
                onClick={handleDownloadManifest}
              >
                ↓ Download manifest.json
              </button>
            </div>
            <p className="text-[10px] font-mono text-slate-600">
              Share each <span className="text-slate-400">{'<id>.json'}</span> with
              the corresponding member (they decrypt it with their password to
              retrieve their secret). Share{" "}
              <span className="text-slate-400">manifest.json</span> with all
              members so they can rebuild the Merkle path on the Submit page.
            </p>

            {builtRoot && (
              <div className="bg-white/5 border border-white/10 p-4">
                <p className="text-[10px] font-mono text-slate-400 mb-2">
                  COMPUTED_MERKLE_ROOT
                </p>
                <p className="break-all font-mono text-xs text-white">
                  {builtRoot}
                </p>
                <p className="mt-2 text-[10px] font-mono text-slate-500">
                  ↳ Automatically filled into the Register Root field below.
                </p>
              </div>
            )}
          </>
        )}
      </section>


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
            {addError}
          </p>
        )}
      </section>


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
            {revokeError}
          </p>
        )}
      </section>


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
