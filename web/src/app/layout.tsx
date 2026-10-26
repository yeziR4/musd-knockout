import type { Metadata } from "next";
import { Geist_Mono, Inter_Tight } from "next/font/google";
import { APP_NAME, TAGLINE } from "@/lib/config";
import "./globals.css";

const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: `${APP_NAME} · No-loss MUSD bracket`,
  description: TAGLINE,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${interTight.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
