"use client";

import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
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

        
        {/* Wallet button */}
        <ConnectButton
          accountStatus="address"
          chainStatus="icon"
          showBalance={false}
        />
      </div>
    </header>
  );
}
