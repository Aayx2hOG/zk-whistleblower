"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", icon: "grid_view", label: "Portal" },
  { href: "/join", icon: "group_add", label: "Join Org" },
  { href: "/admin", icon: "admin_panel_settings", label: "Admin" },
  { href: "/submit", icon: "terminal", label: "Submit Report" },
  { href: "/reviewer", icon: "description", label: "Reviewer" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-full md:w-64 shrink-0 border-b md:border-b-0 md:border-r border-white/10 p-6 flex flex-col gap-8 bg-primary">
      <div className="space-y-4">
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
                <span className="material-symbols-outlined text-[18px]">
                  {icon}
                </span>
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
