"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { buildMerkleTree } from "@zk-whistleblower/shared/src/merkle";
import { addDemoMember, clearDemoMembers, getDemoMembers, removeDemoMember, type DemoMember } from "@zk-whistleblower/shared/src/demoOrg";
import { generateSecret } from "@zk-whistleblower/shared/src/secretGen";
import { initPoseidon, poseidonHash } from "@zk-whistleblower/shared/src/poseidon";
import { useOrg } from "@zk-whistleblower/ui";

export default function JoinOrgPage() {
  const { selectedOrgId } = useOrg();
  const [memberId, setMemberId] = useState("");
  const [members, setMembers] = useState<DemoMember[]>([]);
  const [poseidonReady, setPoseidonReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const refreshMembers = useCallback(() => {
    setMembers(getDemoMembers(selectedOrgId));
  }, [selectedOrgId]);

  useEffect(() => {
    refreshMembers();
  }, [refreshMembers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await initPoseidon();
      if (!cancelled) setPoseidonReady(true);
    })().catch(() => {
      if (!cancelled) setPoseidonReady(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const root = useMemo(() => {
    if (!poseidonReady || !members.length) return "";

    const commitments = members.map((m) => BigInt(m.commitment));
    return buildMerkleTree(commitments).root.toString();
  }, [members, poseidonReady]);

  const handleJoin = useCallback(async () => {
    setError("");
    setStatus("working");

    try {
      const id = memberId.trim();
      if (!id) throw new Error("Member ID is required.");

      await initPoseidon();
      const secret = generateSecret();
      const commitment = poseidonHash([secret]);

      addDemoMember(selectedOrgId, {
        id,
        secret: secret.toString(),
        commitment: commitment.toString(),
      });

      setMemberId("");
      refreshMembers();
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [memberId, refreshMembers, selectedOrgId]);

  const handleRemove = (id: string) => {
    removeDemoMember(selectedOrgId, id);
    refreshMembers();
  };

  const handleClearAll = () => {
    clearDemoMembers(selectedOrgId);
    refreshMembers();
  };

  return (
    <div className="space-y-10">
      <div className="mb-6">
        <h1 className="text-white text-4xl font-black leading-none tracking-tighter mb-3 uppercase italic">
          Join Org (Demo)
        </h1>
        <p className="text-slate-500 text-sm font-mono tracking-tight">
          Generate a private secret locally, compute your commitment, and join the local demo member list.
        </p>
        <p className="text-slate-500 text-xs font-mono tracking-tight mt-2">
          Active org: {selectedOrgId}
        </p>
      </div>

      <section className="card space-y-6">
        <div>
          <p className="step-label">01_MEMBERSHIP_ENROLLMENT</p>
          <h2 className="section-heading">Create Demo Member</h2>
        </div>

        <div>
          <label className="label">Member ID</label>
          <input
            className="input font-mono text-sm"
            placeholder="e.g. demo-user-1"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
            disabled={status === "working"}
          />
          <p className="mt-1 text-[10px] font-mono text-slate-600">
            Secret and commitment are generated in-browser. Secret is stored only in your local browser for demo use.
          </p>
        </div>

        <button
          className="btn-primary"
          onClick={handleJoin}
          disabled={status === "working" || !memberId.trim()}
        >
          {status === "working" ? "JOINING…" : "JOIN ORG"}
        </button>

        {status === "done" && (
          <p className="bg-green-900/30 border border-green-500/30 p-3 text-xs text-green-400">
            Member joined. Open Submit page and load demo org context.
          </p>
        )}
        {status === "error" && (
          <p className="bg-red-900/30 border border-red-500/30 p-3 text-xs text-red-400">
            {error}
          </p>
        )}
      </section>

      <section className="card space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="step-label">02_ORG_STATE</p>
            <h2 className="section-heading">Demo Member List</h2>
          </div>
          <button
            className="btn-danger text-xs px-3 py-2"
            onClick={handleClearAll}
            disabled={!members.length}
          >
            Clear All
          </button>
        </div>

        {!members.length && (
          <p className="text-xs font-mono text-slate-500">No demo members yet.</p>
        )}

        {members.length > 0 && (
          <>
            <div className="space-y-2">
              {members.map((m, idx) => (
                <div
                  key={m.id}
                  className="flex items-start gap-3 bg-white/5 border border-white/10 p-3"
                >
                  <div className="w-20 shrink-0 text-xs font-mono text-slate-400">#{idx}</div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-bold text-white">{m.id}</p>
                    <p className="text-[10px] font-mono text-slate-500 break-all">
                      secret: {m.secret}
                    </p>
                    <p className="text-[10px] font-mono text-slate-500 break-all">
                      commitment: {m.commitment}
                    </p>
                  </div>
                  <button
                    className="text-red-400 hover:text-red-300 text-xs font-bold"
                    onClick={() => handleRemove(m.id)}
                  >
                    REMOVE
                  </button>
                </div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 p-4">
              <p className="text-[10px] font-mono text-slate-400 mb-2">CURRENT_ROOT</p>
              <p className="font-mono text-xs text-white break-all">{root}</p>
              <p className="mt-2 text-[10px] font-mono text-slate-600">
                This root will be auto-registered on-chain when you submit your report. No admin action needed.
              </p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
