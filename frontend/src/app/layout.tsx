import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/providers/WagmiProvider";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "ZK Whistleblower",
  description:
    "Anonymous whistleblowing using zero-knowledge proofs + Ethereum",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen antialiased bg-background-dark text-slate-100 font-display selection:bg-white selection:text-black bg-grid">
        <Providers>
          <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
            <Navbar />
            <div className="flex-1 flex flex-col md:flex-row">
              <Sidebar />
              <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
