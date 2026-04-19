"use client";

import { Providers, OrgProvider, Navbar, Sidebar, type NavItem } from "@zk-whistleblower/ui";

const REPORTER_NAV_ITEMS: NavItem[] = [
  { href: "/submit", icon: "terminal", label: "Submit Report" },
];

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <OrgProvider>
        <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
          <Navbar />
          <div className="flex-1 flex flex-col md:flex-row">
            <Sidebar navItems={REPORTER_NAV_ITEMS} />
            <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full">
              {children}
            </main>
          </div>
        </div>
      </OrgProvider>
    </Providers>
  );
}
