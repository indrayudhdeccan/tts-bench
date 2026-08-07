import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { LanguageTabsShell } from "@/components/LanguageTabsShell";
import { SiteFooter } from "@/components/SiteFooter";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Project Beatles (TTS Bench) | Deccan AI",
  description: "Multilingual TTS arena — blind pairwise evaluation",
  icons: { icon: "/deccan-favicon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <SiteHeader />
        <LanguageTabsShell />
        <main className="arena-content">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
