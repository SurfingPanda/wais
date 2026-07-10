import type { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-provider";
import { SyncProvider } from "@/lib/sync-provider";
import { Toaster } from "@/components/ui/sonner";
import { SerwistProvider } from "@serwist/next/react";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wais",
  description: "Wais is an offline-first budgeting app that syncs when you're back online.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Wais",
  },
  // Favicon/apple-touch-icon come from src/app/icon.png and apple-icon.png
  // (Next's file-convention icons) — no manual `icons` entry needed here.
};

export const viewport: Viewport = {
  themeColor: "#171717",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakartaSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Serwist only emits public/sw.js for production builds (see next.config.ts),
            so registration is disabled outside production to avoid a 404 in dev. */}
        <SerwistProvider swUrl="/sw.js" disable={process.env.NODE_ENV !== "production"}>
          <AuthProvider>
            <SyncProvider>{children}</SyncProvider>
          </AuthProvider>
        </SerwistProvider>
        <Toaster />
      </body>
    </html>
  );
}
