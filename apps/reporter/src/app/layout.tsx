import type { Metadata } from "next";
import "./globals.css";
import { Inter, JetBrains_Mono } from "next/font/google";
import ClientLayout from "./ClientLayout";

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
  title: "ZK Whistleblower — Reporter",
  description:
    "Submit anonymous whistleblower reports using zero-knowledge proofs + Ethereum.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-screen antialiased bg-background-dark text-slate-100 font-display selection:bg-white selection:text-black bg-grid">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
