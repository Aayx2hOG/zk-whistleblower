"use client";

import Link from "next/link";
import { useOrg } from "./OrgProvider";
import { useEffect, useState } from "react";

export default function Navbar() {
  const { selectedOrgId } = useOrg();
  const [ConnectButton, setConnectButton] = useState<React.ComponentType<{
    showBalance?: boolean;
    chainStatus?: "icon" | "name" | "full" | "none";
    accountStatus?: "avatar" | "address" | "full";
    label?: string;
  }> | null>(null);

  useEffect(() => {
    void (async () => {
      const { ConnectButton: CB } = await import("@rainbow-me/rainbowkit");
      setConnectButton(() => CB);
    })();
  }, []);

  return (
    <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 md:px-12 bg-primary">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-4 text-white">

        <h2 className="text-white text-sm font-black tracking-tighter uppercase font-mono">
          ZK-Whistleblower
        </h2>
      </Link>

      {/* Right side */}
      <div className="flex items-center gap-6">
        {/* Status indicators */}
        <div className="hidden md:flex gap-4 font-mono text-[10px] text-slate-500">
          <span>STATUS: ENCRYPTED</span>
          <span>UPTIME: 99.99%</span>
        </div>

        <span className="hidden sm:inline text-[10px] font-mono uppercase tracking-widest text-slate-300 border border-white/20 px-3 py-2">
          ORG {selectedOrgId}
        </span>

        {/* Wallet connect button */}
        {ConnectButton && (
          <ConnectButton
            showBalance={false}
            chainStatus="icon"
            accountStatus="address"
          />
        )}
      </div>
    </header>
  );
}
