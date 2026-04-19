"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { Icon, AdminGate } from "@zk-whistleblower/ui";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@zk-whistleblower/shared/src/contracts";
import { relayAddRootForOrg } from "@zk-whistleblower/shared/src/relayer";
import { relayCreateOrganization, relayRevokeRootForOrg, relaySetOrganizationActive } from "@zk-whistleblower/shared/src/relayer";
import { initPoseidon, poseidonHash } from "@zk-whistleblower/shared/src/poseidon";
import { buildMerkleTree } from "@zk-whistleblower/shared/src/merkle";
import { generateSecret, type MemberKeyFile } from "@zk-whistleblower/shared/src/secretGen";
import { encryptSecret, downloadJSON } from "@zk-whistleblower/shared/src/secretGen";

import { useOrg } from "@zk-whistleblower/ui";
import {
  getStoredMembers,
  appendMembers,
  removeStoredMember,
  clearStoredMembers,
  type StoredMember,
} from "@zk-whistleblower/shared/src/adminMemberStore";


interface RootEvent {
  orgId: bigint;
  root: bigint;
  type: "added" | "revoked";
  blockNumber?: bigint;
}


function TxStatus({
  hash,
  label,
  settled,
  pending,
}: {
  hash?: `0x${string}`;
  label: string;
  settled?: boolean;
  pending?: boolean;
}) {
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash });
  if (!hash && !pending) return null;

  const isConfirmed = Boolean(settled || isSuccess);
  const isSubmitting = Boolean(pending || (!isConfirmed && isLoading));

  return (
    <div className="mt-2 space-y-1 text-xs font-mono">
      {hash && (
        <p className="text-slate-400 break-all">
          TX_HASH: {hash}
        </p>
      )}
      {isSubmitting && <p className="text-yellow-400"> {label}…</p>}
      {isConfirmed && <p className="text-brand-500">✓ Confirmed!</p>}
    </div>
  );
}

// Main page 
export default function AdminPage() {
  const { selectedOrgId, rememberOrgId } = useOrg();

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


  // Cumulative stored member state
  const [storedMembers, setStoredMembers] = useState<StoredMember[]>([]);

  // Build tree output state (shared with step 2)
  const [builtRoot, setBuiltRoot] = useState<string>("");

  //Add root state 
  const [addRootInput, setAddRootInput] = useState<string>("");
  const [addHash, setAddHash] = useState<`0x${string}` | undefined>();
  const [addSettled, setAddSettled] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState("");

  //Revoke root state
  const [revokeInput, setRevokeInput] = useState<string>("");
  const [revokeHash, setRevokeHash] = useState<`0x${string}` | undefined>();
  const [revokeSettled, setRevokeSettled] = useState(false);
  const [revokePending, setRevokePending] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  //Live event log
  const [events, setEvents] = useState<RootEvent[]>([]);
  const seenEvents = useRef<Set<string>>(new Set());

  // Organization management state
  const [createOrgId, setCreateOrgId] = useState("");
  const [createOrgName, setCreateOrgName] = useState("");
  const [createOrgPending, setCreateOrgPending] = useState(false);
  const [createOrgError, setCreateOrgError] = useState("");
  const [createOrgSuccess, setCreateOrgSuccess] = useState("");

  const [targetOrgId, setTargetOrgId] = useState(String(selectedOrgId));
  const [targetOrgActive, setTargetOrgActive] = useState(true);
  const [setOrgPending, setSetOrgPending] = useState(false);
  const [setOrgError, setSetOrgError] = useState("");
  const [setOrgSuccess, setSetOrgSuccess] = useState("");

  // ── Rehydrate cumulative members from localStorage on load / org switch ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = getStoredMembers(selectedOrgId);
      if (cancelled) return;
      setStoredMembers(stored);

      if (stored.length > 0) {
        await initPoseidon();
        if (cancelled) return;
        const commitments = stored.map((m) => BigInt(m.commitment));
        const { root } = buildMerkleTree(commitments);
        setBuiltRoot(root.toString());
        setAddRootInput(root.toString());
      }
    })().catch(() => {/* swallow */});

    return () => { cancelled = true; };
  }, [selectedOrgId]);

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "RootAddedForOrg",
    onLogs(logs) {
      logs.forEach((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seenEvents.current.has(key)) return;
        seenEvents.current.add(key);
        if ("args" in log && log.args)
          setEvents((e) => [
            {
              orgId: (log.args as { orgId: bigint }).orgId,
              root: (log.args as { root: bigint }).root,
              type: "added",
              blockNumber: log.blockNumber,
            },
            ...e,
          ]);
      });
    },
  });

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "RootRevokedForOrg",
    onLogs(logs) {
      logs.forEach((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seenEvents.current.has(key)) return;
        seenEvents.current.add(key);
        if ("args" in log && log.args)
          setEvents((e) => [
            {
              orgId: (log.args as { orgId: bigint }).orgId,
              root: (log.args as { root: bigint }).root,
              type: "revoked",
              blockNumber: log.blockNumber,
            },
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

  //  Secret generation (cumulative – appends only, never regenerates existing)
  const handleGenerateSecrets = useCallback(async () => {
    setGenError("");
    setGenerated([]);
    setGenerating(true);
    try {
      await initPoseidon();

      // Determine which input rows are genuinely new
      const existingIds = new Set(
        storedMembers.map((m) => m.memberId.toLowerCase())
      );
      const newInputs = members.filter(
        (m) => m.id.trim() && !existingIds.has(m.id.trim().toLowerCase())
      );

      if (newInputs.length === 0) {
        throw new Error(
          "All entered IDs already exist in the stored member list. Add new IDs to extend."
        );
      }

      const newGenerated: GeneratedMember[] = [];
      const newStored: StoredMember[] = [];

      for (const mem of newInputs) {
        const secret = generateSecret();
        const commitment = poseidonHash([secret]);
        const pwd = mem.password.trim() || mem.id.trim();
        const encrypted = await encryptSecret(secret, pwd);
        const memberId = mem.id.trim();
        const commitmentStr = commitment.toString();

        newStored.push({
          memberId,
          commitment: commitmentStr,
          encrypted,
          createdAt: new Date().toISOString(),
        });

        newGenerated.push({
          id: memberId,
          commitment: commitmentStr,
          leafIndex: -1, // will be recalculated below
          keyFile: {
            memberId,
            commitment: commitmentStr,
            encrypted,
          },
        });
      }

      // Persist cumulatively
      const cumulative = appendMembers(selectedOrgId, newStored);
      setStoredMembers(cumulative);

      // Assign correct leaf indices to the newly generated members
      const cumulativeIds = cumulative.map((m) => m.memberId);
      for (const g of newGenerated) {
        g.leafIndex = cumulativeIds.indexOf(g.id);
      }
      setGenerated(newGenerated);

      // Recompute root from ALL cumulative commitments
      const commitments = cumulative.map((m) => BigInt(m.commitment));
      const { root } = buildMerkleTree(commitments);
      setBuiltRoot(root.toString());
      setAddRootInput(root.toString());

      // Clear input rows since they've been processed
      setMembers([{ id: "", password: "" }]);
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }, [members, storedMembers, selectedOrgId]);

  const handleDownloadKeyFile = (m: GeneratedMember) =>
    downloadJSON(m.keyFile, `${m.id}.json`);

  const handleDownloadManifest = () =>
    downloadJSON(
      {
        commitments: storedMembers.map((m) => m.commitment),
        root: builtRoot,
        memberCount: storedMembers.length,
        treeDepth: 10,
      },
      "manifest.json"
    );

  // Remove a stored member and recompute root
  const handleRemoveStoredMember = useCallback(async (memberId: string) => {
    removeStoredMember(selectedOrgId, memberId);
    const updated = getStoredMembers(selectedOrgId);
    setStoredMembers(updated);
    if (updated.length > 0) {
      await initPoseidon();
      const commitments = updated.map((m) => BigInt(m.commitment));
      const { root } = buildMerkleTree(commitments);
      setBuiltRoot(root.toString());
      setAddRootInput(root.toString());
    } else {
      setBuiltRoot("");
      setAddRootInput("");
    }
  }, [selectedOrgId]);

  // Clear all stored members
  const handleClearStoredMembers = useCallback(() => {
    clearStoredMembers(selectedOrgId);
    setStoredMembers([]);
    setBuiltRoot("");
    setAddRootInput("");
    setGenerated([]);
  }, [selectedOrgId]);



  const handleCreateOrganization = async () => {
    setCreateOrgError("");
    setCreateOrgSuccess("");
    const orgId = Number(createOrgId);
    if (!Number.isFinite(orgId) || orgId < 0) {
      setCreateOrgError("Enter a valid non-negative org id");
      return;
    }
    if (!createOrgName.trim()) {
      setCreateOrgError("Organization name is required");
      return;
    }

    setCreateOrgPending(true);
    try {
      await relayCreateOrganization(orgId, createOrgName.trim());
      rememberOrgId(orgId);
      setCreateOrgSuccess(`Organization ${orgId} created`);
    } catch (e: unknown) {
      setCreateOrgError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateOrgPending(false);
    }
  };

  const handleSetOrganizationActive = async () => {
    setSetOrgError("");
    setSetOrgSuccess("");
    const orgId = Number(targetOrgId);
    if (!Number.isFinite(orgId) || orgId < 0) {
      setSetOrgError("Enter a valid non-negative org id");
      return;
    }

    setSetOrgPending(true);
    try {
      await relaySetOrganizationActive(orgId, targetOrgActive);
      rememberOrgId(orgId);
      setSetOrgSuccess(`Organization ${orgId} updated`);
    } catch (e: unknown) {
      setSetOrgError(e instanceof Error ? e.message : String(e));
    } finally {
      setSetOrgPending(false);
    }
  };

  const handleAddRoot = async () => {
    if (!addRootInput) return;
    setAddError("");
    setAddHash(undefined);
    setAddSettled(false);
    setAddPending(true);
    try {
      const { txHash, settled, receiptStatus } = await relayAddRootForOrg(selectedOrgId, addRootInput.trim());
      setAddHash(txHash);
      if (receiptStatus === "reverted") {
        throw new Error("Add root transaction reverted on-chain");
      }
      setAddSettled(Boolean(settled));
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAddPending(false);
    }
  };

  const handleRevokeRoot = async () => {
    if (!revokeInput) return;
    setRevokeError("");
    setRevokeHash(undefined);
    setRevokeSettled(false);
    setRevokePending(true);
    try {
      const { txHash, settled, receiptStatus } = await relayRevokeRootForOrg(selectedOrgId, revokeInput.trim());
      setRevokeHash(txHash);
      if (receiptStatus === "reverted") {
        throw new Error("Revoke root transaction reverted on-chain");
      }
      setRevokeSettled(Boolean(settled));
    } catch (e: unknown) {
      setRevokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokePending(false);
    }
  };

  return (
    <AdminGate>
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
        <p className="text-slate-500 text-xs font-mono tracking-tight mt-2">
          Active org: {selectedOrgId}
        </p>
      </div>

      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">00_ORGANIZATIONS</p>
            <h2 className="section-heading">Organization Management</h2>
          </div>
          <Icon name="apartment" className="text-white/20 text-2xl" />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-3 bg-white/5 border border-white/10 p-4">
            <p className="label">Create Organization</p>
            <input
              className="input font-mono text-xs"
              placeholder="Org ID"
              value={createOrgId}
              onChange={(e) => setCreateOrgId(e.target.value)}
            />
            <input
              className="input font-mono text-xs"
              placeholder="Organization name"
              value={createOrgName}
              onChange={(e) => setCreateOrgName(e.target.value)}
            />
            <button className="btn-primary" onClick={handleCreateOrganization} disabled={createOrgPending}>
              {createOrgPending ? "Submitting…" : "Create Organization"}
            </button>
            {createOrgError && <p className="text-[10px] font-mono text-red-400">{createOrgError}</p>}
            {createOrgSuccess && <p className="text-[10px] font-mono text-green-400">{createOrgSuccess}</p>}
          </div>

          <div className="space-y-3 bg-white/5 border border-white/10 p-4">
            <p className="label">Set Organization Status</p>
            <input
              className="input font-mono text-xs"
              placeholder="Org ID"
              value={targetOrgId}
              onChange={(e) => setTargetOrgId(e.target.value)}
            />
            <select
              className="input font-mono text-xs bg-primary"
              value={targetOrgActive ? "active" : "inactive"}
              onChange={(e) => setTargetOrgActive(e.target.value === "active")}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="btn-ghost" onClick={handleSetOrganizationActive} disabled={setOrgPending}>
              {setOrgPending ? "Submitting…" : "Update Status"}
            </button>
            {setOrgError && <p className="text-[10px] font-mono text-red-400">{setOrgError}</p>}
            {setOrgSuccess && <p className="text-[10px] font-mono text-green-400">{setOrgSuccess}</p>}
          </div>
        </div>
      </section>


      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">01_ACCESS_CREDENTIALS</p>
            <h2 className="section-heading">Issue Access Credentials</h2>
          </div>
          <Icon name="group_add" className="text-white/20 text-2xl" />
        </div>
        <p className="text-xs text-slate-500 font-mono">
          Add member IDs and an optional password. A secure access credential
          is generated for each member and packaged into a downloadable key file.
          Membership here is <strong className="text-slate-300">cumulative</strong>:
          new members are appended to your existing organization list. 
          The cryptographic access checksum is updated automatically.
        </p>

        {/* ── Cumulative stored members summary ── */}
        {storedMembers.length > 0 && (
          <div className="bg-white/[0.03] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="label">Stored Members ({storedMembers.length})</p>
              <button
                className="btn-danger text-[10px] px-3 py-1"
                onClick={handleClearStoredMembers}
              >
                Clear All
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {storedMembers.map((m, idx) => (
                <div
                  key={m.memberId}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 p-2"
                >
                  <span className="font-mono text-[10px] text-slate-500 w-8 shrink-0">#{idx}</span>
                  <span className="font-mono text-xs text-white flex-1 truncate">
                    {m.memberId}
                  </span>
                  <span className="font-mono text-[10px] text-slate-600 truncate max-w-[140px]">
                    {m.commitment.slice(0, 16)}…
                  </span>
                  <button
                    className="text-red-500 hover:text-red-400 text-xs leading-none"
                    onClick={() => handleRemoveStoredMember(m.memberId)}
                    title="Remove stored member"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}



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
            {generating ? "Issuing Credentials…" : "Issue Credentials"}
          </button>
        </div>

        {genError && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {genError}
          </p>
        )}

        {generated.length > 0 && (
          <>
            {/* Newly generated members (this batch) */}
            <div className="space-y-1">
              <p className="label">Newly generated members</p>
              {generated.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 bg-green-900/20 border border-green-500/20 p-3"
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
          </>
        )}

        {/* Manifest + computed root — show whenever we have stored members */}
        {storedMembers.length > 0 && (
          <>
            <div className="flex gap-3">
              <button
                className="btn-ghost flex-1"
                onClick={handleDownloadManifest}
              >
                ↓ Download Organization Directory (manifest.json)
              </button>
            </div>
            <p className="text-[10px] font-mono text-slate-600">
              Share the <span className="text-slate-400">Personal Access File (.json)</span> with
              the corresponding member privately. Share the{" "}
              <span className="text-slate-400">Organization Directory (manifest.json)</span> securely with all
              members so they can authenticate securely on the reporter application.
            </p>

            {builtRoot && (
              <div className="bg-white/5 border border-white/10 p-4">
                <p className="text-[10px] font-mono text-slate-400 mb-2">
                  COMPUTED ACCESS CHECKSUM ({storedMembers.length} active members)
                </p>
                <p className="break-all font-mono text-xs text-white">
                  {builtRoot}
                </p>
                <p className="mt-2 text-[10px] font-mono text-slate-500">
                  ↳ This checksum guarantees your organization's valid members. It is automatically filled below.
                </p>
              </div>
            )}
          </>
        )}
      </section>


      <section className="card space-y-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <p className="step-label">02_SYNC_NETWORK</p>
            <h2 className="section-heading">Sync Access List (On-Chain)</h2>
          </div>
          <Icon name="add_circle" className="text-white/20 text-2xl" />
        </div>
        <div>
          <label className="label">Access list checksum (Merkle root)</label>
          <input
            className="input font-mono text-xs"
            placeholder="Paste root value or build from Step 1"
            value={addRootInput}
            onChange={(e) => setAddRootInput(e.target.value)}
          />
        </div>
        <p className="text-[10px] font-mono text-slate-500">Target org: {selectedOrgId}</p>
        <button
          className="btn-primary"
          onClick={handleAddRoot}
          disabled={addPending || !addRootInput}
        >
          {addPending ? "Syncing Network…" : "Sync Access List"}
        </button>
        <TxStatus hash={addHash} label="Syncing list" settled={addSettled} pending={addPending} />
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
            <h2 className="section-heading">Revoke Access List</h2>
          </div>
          <Icon name="delete_forever" className="text-white/20 text-2xl" />
        </div>
        <div>
          <label className="label">Checksum to revoke (decimal)</label>
          <input
            className="input font-mono text-xs"
            placeholder="Enter the root value"
            value={revokeInput}
            onChange={(e) => setRevokeInput(e.target.value)}
          />
        </div>
        <p className="text-[10px] font-mono text-slate-500">Target org: {selectedOrgId}</p>
        <button
          className="btn-danger"
          onClick={handleRevokeRoot}
          disabled={revokePending || !revokeInput}
        >
          {revokePending ? "Revoking…" : "Revoke List"}
        </button>
        <TxStatus hash={revokeHash} label="Revoking list" settled={revokeSettled} pending={revokePending} />
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
            <Icon name="monitoring" className="text-white/20 text-2xl" />
          </div>
          <ul className="space-y-2">
            {events
              .filter((ev) => Number(ev.orgId) === selectedOrgId)
              .map((ev, i) => (
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
                  org={ev.orgId.toString()} root={ev.root.toString()}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
    </AdminGate>
  );
}
