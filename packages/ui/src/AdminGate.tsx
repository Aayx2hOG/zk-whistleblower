"use client";

import { ReactNode, useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { REGISTRY_ABI, REGISTRY_ADDRESS } from "@zk-whistleblower/shared/src/contracts";
import { useOrg } from "./OrgProvider";
import Icon from "./Icon";

interface AdminGateProps {
  children: ReactNode;
  /** Optional custom message for the not-connected state */
  connectMessage?: string;
  /** Optional custom message for the access-denied state */
  deniedMessage?: string;
}

/**
 * AdminGate — wraps admin page content with wallet-based access control.
 *
 * 1. Not connected  → "Connect Wallet" prompt
 * 2. Connected, checking → Loading spinner
 * 3. Connected, NOT admin → "Access Denied"
 * 4. Connected + admin → renders children
 *
 * Re-evaluates whenever the connected wallet or selected org changes.
 */
export default function AdminGate({
  children,
  connectMessage = "Connect your wallet to verify admin access for this organization.",
  deniedMessage = "Your connected wallet is not registered as an admin for this organization.",
}: AdminGateProps) {
  const { address, isConnected } = useAccount();
  const { selectedOrgId } = useOrg();
  const [ConnectButton, setConnectButton] = useState<React.ComponentType<{
    showBalance?: boolean;
    chainStatus?: "icon" | "name" | "full" | "none";
    accountStatus?: "avatar" | "address" | "full";
  }> | null>(null);

  // Dynamically import ConnectButton to avoid SSR issues
  useEffect(() => {
    void (async () => {
      const { ConnectButton: CB } = await import("@rainbow-me/rainbowkit");
      setConnectButton(() => CB);
    })();
  }, []);

  const {
    data: isAdmin,
    isLoading: isChecking,
    error: checkError,
  } = useReadContract({
    address: REGISTRY_ADDRESS,
    abi: REGISTRY_ABI,
    functionName: "isOrgAdmin",
    args: [BigInt(selectedOrgId), address as `0x${string}`],
    query: {
      enabled: isConnected && !!address,
    },
  });

  // ── State 1: Not connected ──
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
        <div className="text-center space-y-4 max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 border-2 border-white/20 mb-2">
            <Icon name="lock" className="text-4xl text-white/40" />
          </div>
          <h2 className="text-white text-2xl font-black uppercase tracking-tighter">
            Wallet Required
          </h2>
          <p className="text-slate-500 text-sm font-mono leading-relaxed">
            {connectMessage}
          </p>
        </div>
        {ConnectButton && (
          <div className="flex flex-col items-center gap-4">
            <ConnectButton showBalance={false} chainStatus="icon" />
            <p className="text-[10px] font-mono text-slate-600 uppercase tracking-widest">
              Identity verification only — zero gas required
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── State 2: Connected, checking admin status ──
  if (isChecking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="inline-flex items-center justify-center w-16 h-16 border border-white/20 animate-pulse">
          <Icon name="verified_user" className="text-3xl text-white/30" />
        </div>
        <div className="text-center space-y-2">
          <p className="text-white text-sm font-bold uppercase tracking-widest">
            Verifying Access
          </p>
          <p className="text-[10px] font-mono text-slate-500">
            Checking on-chain admin status for org {selectedOrgId}…
          </p>
          <p className="text-[10px] font-mono text-slate-600 truncate max-w-xs">
            {address}
          </p>
        </div>
      </div>
    );
  }

  // ── State 3: Check failed (RPC error) ──
  if (checkError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="inline-flex items-center justify-center w-16 h-16 border border-red-500/30">
          <Icon name="info" className="text-3xl text-red-400" />
        </div>
        <div className="text-center space-y-2 max-w-md">
          <p className="text-white text-sm font-bold uppercase tracking-widest">
            Verification Failed
          </p>
          <p className="text-xs font-mono text-red-400 bg-red-500/10 border border-red-500/20 p-3">
            {checkError.message}
          </p>
          <p className="text-[10px] font-mono text-slate-500">
            Ensure the contract is deployed and your wallet is connected to the correct network.
          </p>
        </div>
      </div>
    );
  }

  // ── State 4: Connected but NOT admin ──
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border border-red-500/30 bg-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.15)] relative">
          <Icon name="lock" className="text-4xl text-red-500 relative z-10" />
        </div>
        <div className="text-center space-y-4 max-w-md">
          <h2 className="text-white text-3xl font-black uppercase tracking-tighter">
            Access Denied
          </h2>
          <p className="text-slate-400 text-sm font-mono leading-relaxed px-4">
            {deniedMessage}
          </p>
          <div className="mt-6 border border-red-500/20 bg-red-500/5 backdrop-blur-sm rounded-xl p-5 space-y-3 relative overflow-hidden group">
            <div className="flex items-center gap-2 justify-center relative">
              <Icon name="key" className="text-red-400/70 text-sm" />
              <span className="text-[10px] font-mono text-red-400/70 uppercase tracking-widest">Connected Address</span>
            </div>
            <p className="font-mono text-sm text-red-300 break-all relative bg-black/20 p-2 rounded border border-red-500/10">
              {address}
            </p>
            <div className="flex items-center justify-center gap-2 pt-1 relative">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <p className="text-[10px] font-mono text-red-400">
                Org {selectedOrgId} • Not Authorized
              </p>
            </div>
          </div>
          <p className="text-[10px] font-mono text-slate-500 leading-relaxed max-w-sm mx-auto pt-2">
            Contact your organization's super admin to request access.
            You can also try switching to a different org or connecting a different wallet.
          </p>
        </div>
        {ConnectButton && (
          <div className="pt-4 drop-shadow-xl">
            <ConnectButton showBalance={false} chainStatus="icon" />
          </div>
        )}
      </div>
    );
  }

  // ── State 5: Connected + verified admin ──
  return <>{children}</>;
}
