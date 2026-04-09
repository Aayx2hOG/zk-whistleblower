"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "./OrgProvider";
import Icon from "./Icon";

export interface NavItem {
  href: string;
  icon: string;
  label: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { href: "/", icon: "grid_view", label: "Portal" },
];

export default function Sidebar({ navItems = DEFAULT_NAV_ITEMS }: { navItems?: NavItem[] }) {
  const pathname = usePathname();
  const { selectedOrgId, knownOrgIds, setSelectedOrgId } = useOrg();

  const networkName = process.env.NEXT_PUBLIC_NETWORK_NAME?.toLowerCase();
  const networkLabel =
    networkName === "sepolia"
      ? "Sepolia — Chain 11155111"
      : networkName === "mainnet"
        ? "Ethereum — Chain 1"
        : "Local Hardhat — Chain 31337";

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
          <p className="text-[10px] font-mono text-slate-500">
            Use the Admin page to create new organizations.
          </p>
        </div>

        <p className="text-[10px] font-bold text-slate-500 tracking-[0.2em] uppercase">
          Operations
        </p>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ href, icon, label }) => {
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
            {networkLabel}
          </p>
        </div>
      </div>
    </aside>
  );
}
