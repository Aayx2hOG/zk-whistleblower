"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useOrg } from "@/providers/OrgProvider";
import Icon from "@/components/Icon";

const NAV_ITEMS = [
  { href: "/", icon: "grid_view", label: "Portal" },
  { href: "/join", icon: "group_add", label: "Join Org" },
  { href: "/admin", icon: "admin_panel_settings", label: "Admin" },
  { href: "/admin/keys", icon: "key", label: "Admin Keys" },
  { href: "/submit", icon: "terminal", label: "Submit Report" },
  { href: "/reviewer", icon: "description", label: "Reviewer" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { selectedOrgId, knownOrgIds, setSelectedOrgId } = useOrg();
  const [manualOrgId, setManualOrgId] = useState(String(selectedOrgId));

  const applyManualOrg = () => {
    const parsed = Number(manualOrgId);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setSelectedOrgId(parsed);
  };

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-white/10 p-6 flex flex-col gap-8 bg-primary">
      <div className="space-y-4">
        <div className="space-y-2 border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase">
            Active Org
          </p>
          <select
            className="input py-2 text-xs font-mono"
            value={selectedOrgId}
            onChange={(e) => setSelectedOrgId(Number(e.target.value))}
          >
            {knownOrgIds.map((orgId) => (
              <option key={orgId} value={orgId}>
                Org {orgId}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              className="input py-2 text-xs font-mono"
              value={manualOrgId}
              onChange={(e) => setManualOrgId(e.target.value)}
              placeholder="Org ID"
              inputMode="numeric"
            />
            <button className="btn-ghost text-xs px-3 py-2" onClick={applyManualOrg}>
              Use
            </button>
          </div>
        </div>

        <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase">
          Operations
        </p>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, icon, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? "bg-white text-black font-bold"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Icon name={icon} className="text-[18px]" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto pt-6 border-t border-white/5">
        <div className="p-3 bg-white/5 border border-white/10">
          <p className="text-[10px] font-mono text-slate-400 mb-2">
            NETWORK_INFO
          </p>
          <p className="text-[10px] font-mono text-slate-200">
            Local Hardhat — Chain 31337
          </p>
        </div>
      </div>
    </aside>
  );
}
