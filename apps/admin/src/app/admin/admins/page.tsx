"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useReadContract, useWatchContractEvent } from "wagmi";
import { Icon, AdminGate } from "@zk-whistleblower/ui";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@zk-whistleblower/shared/src/contracts";
import {
  relayGrantOrgAdmin,
  relayRevokeOrgAdmin,
} from "@zk-whistleblower/shared/src/relayer";
import { useOrg } from "@zk-whistleblower/ui";
import {
  getLeagues,
  saveLeague,
  renameLeague,
  deleteLeague,
  getLeagueMembers,
  addLeagueMember,
  removeLeagueMember,
  type League,
  type LeagueMember,
} from "@zk-whistleblower/shared/src/leagueStore";

interface AdminEvent {
  orgId: bigint;
  account: string;
  actor: string;
  type: "granted" | "revoked";
  blockNumber?: bigint;
}

function StatusMsg({ error, success }: { error: string; success: string }) {
  if (error)
    return (
      <p className="text-xs text-red-400 font-mono bg-red-500/10 border border-red-500/20 p-3 rounded-none">
        {error}
      </p>
    );
  if (success)
    return (
      <p className="text-xs text-emerald-400 font-mono">
        ✓ {success}
      </p>
    );
  return null;
}

function Badge({ children, color = "white" }: { children: React.ReactNode; color?: "white" | "purple" | "emerald" | "red" }) {
  const cls = {
    white: "bg-white text-black",
    purple: "bg-purple-500 text-black",
    emerald: "bg-emerald-500 text-black",
    red: "bg-red-500 text-black",
  }[color];
  return (
    <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${cls}`}>
      {children}
    </span>
  );
}

function SectionHeader({
  step,
  title,
  icon,
  badge,
}: {
  step: string;
  title: string;
  icon: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-start mb-4">
      <div>
        <p className="step-label">{step}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <h2 className="section-heading">{title}</h2>
          {badge}
        </div>
      </div>
      <Icon name={icon} className="text-white/15 text-2xl" />
    </div>
  );
}

function AdminsPageInner() {
  const { selectedOrgId } = useOrg();

  const [leagues, setLeagues] = useState<League[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);

  const [newLeagueName, setNewLeagueName] = useState("");
  const [leagueError, setLeagueError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const [assignLeagueId, setAssignLeagueId] = useState("");
  const [assignAddress, setAssignAddress] = useState("");
  const [assignPending, setAssignPending] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignSuccess, setAssignSuccess] = useState("");

  const [revokeAddress, setRevokeAddress] = useState("");
  const [revokePending, setRevokePending] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const [revokeSuccess, setRevokeSuccess] = useState("");

  const [checkAddress, setCheckAddress] = useState("");
  const [checkEnabled, setCheckEnabled] = useState(false);

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const seenEvents = useRef<Set<string>>(new Set());

  const reload = useCallback(() => {
    setLeagues(getLeagues(selectedOrgId));
    setMembers(getLeagueMembers(selectedOrgId));
  }, [selectedOrgId]);

  useEffect(() => {
    reload();
    setAssignLeagueId("");
    setEditingId(null);
  }, [reload]);

  const isValidAddress = /^0x[0-9a-fA-F]{40}$/.test(checkAddress);

  const { data: isAdmin, isFetching: isCheckFetching } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "isOrgAdmin",
    args: [BigInt(selectedOrgId), checkAddress as `0x${string}`],
    query: { enabled: checkEnabled && isValidAddress },
  });

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "OrgAdminGranted",
    onLogs(logs) {
      logs.forEach((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seenEvents.current.has(key)) return;
        seenEvents.current.add(key);
        if ("args" in log && log.args) {
          const args = log.args as { orgId: bigint; account: string; grantedBy: string };
          setEvents((e) => [
            { orgId: args.orgId, account: args.account, actor: args.grantedBy, type: "granted", blockNumber: log.blockNumber },
            ...e,
          ]);
        }
      });
    },
  });

  useWatchContractEvent({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    eventName: "OrgAdminRevoked",
    onLogs(logs) {
      logs.forEach((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seenEvents.current.has(key)) return;
        seenEvents.current.add(key);
        if ("args" in log && log.args) {
          const args = log.args as { orgId: bigint; account: string; revokedBy: string };
          setEvents((e) => [
            { orgId: args.orgId, account: args.account, actor: args.revokedBy, type: "revoked", blockNumber: log.blockNumber },
            ...e,
          ]);
        }
      });
    },
  });

  const handleCreateLeague = () => {
    const name = newLeagueName.trim();
    if (!name) { setLeagueError("League name is required"); return; }
    if (leagues.some((l) => l.name.toLowerCase() === name.toLowerCase())) {
      setLeagueError("A league with this name already exists");
      return;
    }
    const league: League = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
    setLeagues(saveLeague(selectedOrgId, league));
    setNewLeagueName("");
    setLeagueError("");
  };

  const handleSaveRename = (leagueId: string) => {
    const name = editingName.trim();
    if (!name) return;
    setLeagues(renameLeague(selectedOrgId, leagueId, name));
    setEditingId(null);
  };

  const handleDeleteLeague = (leagueId: string) => {
    setLeagues(deleteLeague(selectedOrgId, leagueId));
    setMembers(getLeagueMembers(selectedOrgId));
    if (assignLeagueId === leagueId) setAssignLeagueId("");
  };

  const handleGrant = async () => {
    setAssignError(""); setAssignSuccess("");
    if (!assignLeagueId) { setAssignError("Select a league first"); return; }
    if (!/^0x[0-9a-fA-F]{40}$/.test(assignAddress)) {
      setAssignError("Enter a valid Ethereum address (0x…)");
      return;
    }
    setAssignPending(true);
    try {
      await relayGrantOrgAdmin(selectedOrgId, assignAddress.trim());
      setMembers(addLeagueMember(selectedOrgId, { address: assignAddress.trim(), leagueId: assignLeagueId, assignedAt: new Date().toISOString() }));
      setAssignSuccess("Admin granted and added to league.");
      setAssignAddress("");
    } catch (e: unknown) {
      setAssignError(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignPending(false);
    }
  };

  const handleRevoke = async () => {
    setRevokeError(""); setRevokeSuccess("");
    if (!/^0x[0-9a-fA-F]{40}$/.test(revokeAddress)) {
      setRevokeError("Enter a valid Ethereum address (0x…)");
      return;
    }
    setRevokePending(true);
    try {
      await relayRevokeOrgAdmin(selectedOrgId, revokeAddress.trim());
      setMembers(removeLeagueMember(selectedOrgId, revokeAddress.trim()));
      setRevokeSuccess("Admin role revoked.");
      setRevokeAddress("");
    } catch (e: unknown) {
      setRevokeError(e instanceof Error ? e.message : String(e));
    } finally {
      setRevokePending(false);
    }
  };

  const leagueMap = Object.fromEntries(leagues.map((l) => [l.id, l.name]));

  return (
    <AdminGate>
    <div className="space-y-10">
      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <Badge color="purple">Super Admin</Badge>
          <span className="text-[10px] font-mono text-white/30">org={selectedOrgId}</span>
        </div>
        <h1 className="text-white text-4xl font-black leading-none tracking-tighter uppercase italic mb-1">
          Admin Manager
        </h1>
        <p className="text-slate-500 text-sm font-mono">
          Multi-league access control // on-chain role registry
        </p>
      </div>

      {/* ── 01 League Management ── */}
      <section className="card space-y-5">
        <SectionHeader step="01_LEAGUES" title="League Management" icon="groups" />
        <p className="text-xs text-slate-500 font-mono leading-relaxed">
          Create named admin groups — HR, Dean of Students, IT Security, etc.
          Names are{" "}
          <span className="text-white/60">mutable</span>; delete a league to remove its local records (on-chain roles are unaffected).
        </p>

        <div className="flex gap-2">
          <input
            className="input font-mono text-xs flex-1 py-3"
            placeholder="League name (e.g. HR, Dean of Students)"
            value={newLeagueName}
            onChange={(e) => { setNewLeagueName(e.target.value); setLeagueError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleCreateLeague()}
          />
          <button className="btn-primary px-6 py-3 w-auto" onClick={handleCreateLeague}>
            + Create
          </button>
        </div>
        {leagueError && <p className="text-[10px] font-mono text-red-400">{leagueError}</p>}

        {leagues.length > 0 ? (
          <div className="divide-y divide-white/5 border border-white/10">
            {leagues.map((league) => {
              const count = members.filter((m) => m.leagueId === league.id).length;
              return (
                <div key={league.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                  {editingId === league.id ? (
                    <>
                      <input
                        autoFocus
                        className="input font-mono text-xs flex-1 py-1.5"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveRename(league.id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                      />
                      <button className="text-xs font-bold text-white border border-white/20 px-3 py-1.5 hover:bg-white hover:text-black transition-colors" onClick={() => handleSaveRename(league.id)}>Save</button>
                      <button className="text-xs text-slate-500 hover:text-white px-2" onClick={() => setEditingId(null)}>✕</button>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-bold text-white uppercase tracking-wide">{league.name}</span>
                        <span className="ml-3 text-[10px] font-mono text-slate-600">
                          {count} member{count !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <button
                        className="text-[10px] font-mono text-slate-500 hover:text-white transition-colors px-2 py-1"
                        onClick={() => { setEditingId(league.id); setEditingName(league.name); }}
                        title="Rename"
                      >
                        rename
                      </button>
                      <button
                        className="text-[10px] font-mono text-red-500/60 hover:text-red-400 transition-colors px-2 py-1"
                        onClick={() => handleDeleteLeague(league.id)}
                        title="Delete league"
                      >
                        delete
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-white/10 p-6 text-center">
            <p className="text-[10px] font-mono text-slate-600">No leagues yet — create one above</p>
          </div>
        )}
      </section>

      {/* ── 02 Member Assignment ── */}
      <section className="card space-y-5">
        <SectionHeader step="02_MEMBERS" title="Assign & Revoke Admins" icon="manage_accounts" />
        <p className="text-xs text-slate-500 font-mono leading-relaxed">
          Grant an address org-admin rights and assign it to a league. Revoking removes the on-chain role and clears the league record.
        </p>

        <div className="grid gap-4 md:grid-cols-2">
          {/* Grant */}
          <div className="space-y-3 border border-white/10 p-4">
            <p className="label text-emerald-400/70">Grant Admin Role</p>
            {leagues.length === 0 ? (
              <p className="text-[10px] font-mono text-slate-600">Create a league first.</p>
            ) : (
              <>
                <select
                  className="input font-mono text-xs py-3 bg-transparent"
                  value={assignLeagueId}
                  onChange={(e) => { setAssignLeagueId(e.target.value); setAssignSuccess(""); }}
                >
                  <option value="">Select league…</option>
                  {leagues.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <input
                  className="input font-mono text-xs py-3"
                  placeholder="0x… address"
                  value={assignAddress}
                  onChange={(e) => { setAssignAddress(e.target.value); setAssignSuccess(""); }}
                />
                <button className="btn-primary" onClick={handleGrant} disabled={assignPending}>
                  {assignPending ? "Submitting…" : "Grant Admin"}
                </button>
                <StatusMsg error={assignError} success={assignSuccess} />
              </>
            )}
          </div>

          {/* Revoke */}
          <div className="space-y-3 border border-white/10 p-4">
            <p className="label text-red-400/70">Revoke Admin Role</p>
            <input
              className="input font-mono text-xs py-3"
              placeholder="0x… address"
              value={revokeAddress}
              onChange={(e) => { setRevokeAddress(e.target.value); setRevokeSuccess(""); }}
            />
            <button className="btn-danger" onClick={handleRevoke} disabled={revokePending}>
              {revokePending ? "Submitting…" : "Revoke Admin"}
            </button>
            <StatusMsg error={revokeError} success={revokeSuccess} />
          </div>
        </div>

        {/* Roster */}
        {leagues.length > 0 && members.length > 0 && (
          <div className="space-y-4 pt-2">
            <p className="label">Current Roster</p>
            {leagues.map((league) => {
              const lm = members.filter((m) => m.leagueId === league.id);
              if (!lm.length) return null;
              return (
                <div key={league.id}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-purple-400">{league.name}</span>
                    <span className="flex-1 h-px bg-white/5" />
                  </div>
                  <div className="space-y-1">
                    {lm.map((m) => (
                      <div key={m.address} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] px-3 py-2">
                        <span className="font-mono text-xs text-white/80 flex-1 truncate">{m.address}</span>
                        <span className="text-[9px] font-mono text-slate-600 shrink-0">{new Date(m.assignedAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {(() => {
              const leagueIds = new Set(leagues.map((l) => l.id));
              const unassigned = members.filter((m) => !leagueIds.has(m.leagueId));
              if (!unassigned.length) return null;
              return (
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Unassigned</span>
                    <span className="flex-1 h-px bg-white/5" />
                  </div>
                  {unassigned.map((m) => (
                    <div key={m.address} className="flex items-center gap-3 bg-white/[0.02] border border-white/[0.06] px-3 py-2">
                      <span className="font-mono text-xs text-white/60 flex-1 truncate">{m.address}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* ── 03 Verify Status ── */}
      <section className="card space-y-5">
        <SectionHeader step="03_VERIFY" title="Verify Admin Status" icon="verified_user" />
        <p className="text-xs text-slate-500 font-mono">
          Read-only on-chain query — no transaction required.
        </p>
        <div className="space-y-3 max-w-lg">
          <input
            className="input font-mono text-xs py-3"
            placeholder="0x… address to check"
            value={checkAddress}
            onChange={(e) => { setCheckAddress(e.target.value); setCheckEnabled(false); }}
          />
          <button
            className="btn-ghost w-full"
            onClick={() => setCheckEnabled(true)}
            disabled={!isValidAddress}
          >
            Check Status
          </button>

          {checkEnabled && (
            <div className="border border-white/10 p-4">
              {isCheckFetching ? (
                <p className="text-xs font-mono text-slate-400 animate-pulse">Querying chain…</p>
              ) : isAdmin !== undefined ? (
                <div className="flex items-start gap-4">
                  <span className={`text-3xl font-black leading-none mt-0.5 ${isAdmin ? "text-emerald-400" : "text-red-400"}`}>
                    {isAdmin ? "✓" : "✗"}
                  </span>
                  <div className="space-y-0.5">
                    <p className="text-xs font-mono text-white">
                      {checkAddress.slice(0, 12)}…{checkAddress.slice(-10)}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500">
                      {isAdmin ? `IS admin on org ${selectedOrgId}` : `NOT admin on org ${selectedOrgId}`}
                    </p>
                    {isAdmin && (() => {
                      const hit = members.find((m) => m.address.toLowerCase() === checkAddress.toLowerCase());
                      const name = hit ? leagueMap[hit.leagueId] : null;
                      return name ? <p className="text-[10px] font-mono text-purple-400">League: {name}</p> : null;
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* ── 04 Live Feed ── */}
      {events.length > 0 && (
        <section className="card space-y-4">
          <SectionHeader step="04_LIVE_FEED" title="Admin Role Events" icon="monitoring" />
          <ul className="space-y-1.5">
            {events.map((ev, i) => {
              const hit = members.find((m) => m.address.toLowerCase() === ev.account.toLowerCase());
              const leagueName = hit ? leagueMap[hit.leagueId] : null;
              return (
                <li key={i} className="flex items-start gap-3 border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-xs">
                  <span className={`font-black shrink-0 ${ev.type === "granted" ? "text-emerald-400" : "text-red-400"}`}>
                    {ev.type === "granted" ? "✓" : "✗"}
                  </span>
                  <div className="font-mono text-slate-400 space-y-0.5 flex-1 min-w-0">
                    <p className="truncate">
                      <span className="text-white/30">account=</span>{ev.account}
                      {leagueName && <span className="ml-2 text-purple-400 text-[10px]">({leagueName})</span>}
                    </p>
                    <p className="truncate text-[10px]">
                      <span className="text-white/30">org=</span>{ev.orgId.toString()}
                      <span className="text-white/30 ml-3">by=</span>{ev.actor}
                      {ev.blockNumber != null && <><span className="text-white/30 ml-3">block=</span>{ev.blockNumber.toString()}</>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
    </AdminGate>
  );
}

export default function AdminsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <div className="space-y-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-purple-500 text-black">Super Admin</span>
          </div>
          <h1 className="text-white text-4xl font-black leading-none tracking-tighter uppercase italic mb-1">Admin Manager</h1>
          <p className="text-slate-500 text-sm font-mono">Multi-league access control // on-chain role registry</p>
        </div>
        <div className="card flex items-center gap-3">
          <span className="text-xs font-mono text-slate-500 animate-pulse">Initialising wallet connection…</span>
        </div>
      </div>
    );
  }

  return <AdminsPageInner />;
}
