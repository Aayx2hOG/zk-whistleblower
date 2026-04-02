import type { Metadata } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import Providers from "@/providers/WagmiProvider";
import { OrgProvider } from "@/providers/OrgProvider";
import Navbar from "@/components/Navbar";
import Sidebar from "@/components/Sidebar";

// Self-hosted via next/font — zero external network requests, no render-blocking
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-jetbrains",
  display: "swap",
});

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
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased bg-background-dark text-slate-100 font-display selection:bg-white selection:text-black bg-grid">
        <Providers>
          <OrgProvider>
            <div className="relative flex min-h-screen w-full flex-col overflow-x-hidden">
              <Navbar />
              <div className="flex-1 flex flex-col md:flex-row">
                <Sidebar />
                <main className="flex-1 p-6 md:p-12 max-w-4xl mx-auto w-full">
                  {children}
                </main>
              </div>
            </div>
          </OrgProvider>
        </Providers>
      </body>
    </html>
  );
}
