"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Coins,
  HandCoins,
  Landmark,
  PiggyBank,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  Wallet,
  WifiOff,
} from "lucide-react";

const BAR_HEIGHTS = [35, 55, 40, 72, 50, 86, 64];

const FEATURES = [
  {
    icon: WifiOff,
    title: "Works fully offline",
    description:
      "Every read and write goes to your device first — check balances and log spending with zero signal, then it syncs when you're back online.",
  },
  {
    icon: Landmark,
    title: "Track every account",
    description:
      "Cash, debit, credit, savings — each balance updates automatically as you tag transactions to it. No manual math, ever.",
  },
  {
    icon: HandCoins,
    title: "Loans that remind you",
    description:
      "Register recurring or one-time loans, set a due date, and get an in-app nudge as it approaches — instead of finding out you missed it.",
  },
  {
    icon: PiggyBank,
    title: "Budgets that stay honest",
    description:
      "Set a monthly limit per category and see instantly what's on track, near the limit, or over — before it becomes a problem.",
  },
  {
    icon: Coins,
    title: "Any currency you use",
    description:
      "Switch between USD, EUR, PHP, and more from your profile — every number across the app updates immediately.",
  },
  {
    icon: Smartphone,
    title: "Install it like an app",
    description:
      "Add Wais to your home screen for a real app experience — no browser chrome, a bottom nav built for one-handed use.",
  },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const primaryHref = !loading && user ? "/dashboard" : "/login";
  const primaryLabel = !loading && user ? "Go to dashboard" : "Get started free";

  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-emerald-50 via-background to-background dark:from-emerald-950/30 dark:via-background">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-emerald-400/25 blur-3xl animate-blob" />
        <div className="absolute top-1/4 -right-24 h-80 w-80 rounded-full bg-teal-400/25 blur-3xl animate-blob [animation-delay:2.5s]" />
        <div className="absolute top-[70vh] left-1/4 h-72 w-72 rounded-full bg-amber-300/15 blur-3xl animate-blob [animation-delay:5s]" />
      </div>

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-extrabold text-white shadow-md shadow-emerald-500/30">
            W
          </span>
          <span className="text-lg font-semibold">Wais</span>
        </div>
        <div className="flex items-center gap-2">
          {!loading && user ? (
            <Button className="gap-1.5" nativeButton={false} render={<Link href="/dashboard" />}>
              Dashboard <ArrowRight className="size-4" />
            </Button>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
                Sign in
              </Button>
              <Button
                className="gap-1.5 border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 hover:from-emerald-600 hover:to-teal-700"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Get started
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center gap-14 px-6 pt-10 pb-24 lg:flex-row lg:items-center lg:pt-16">
        <div
          className={cn(
            "flex-1 space-y-6 text-center transition-all duration-700 lg:text-left",
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Every peso, on a{" "}
            <span className="bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent dark:from-emerald-400 dark:to-teal-400">
              mission.
            </span>
          </h1>
          <p className="mx-auto max-w-lg text-lg text-muted-foreground lg:mx-0">
            Wais tracks your spending, accounts, budgets, and loans — and keeps working even
            without a connection. Nothing to configure, nothing to lose track of.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Button
              size="lg"
              className="w-full gap-1.5 border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-emerald-500/40 sm:w-auto"
              nativeButton={false} render={<Link href={primaryHref} />}
            >
              {primaryLabel}
              <ArrowRight className="size-4" />
            </Button>
            {!(!loading && user) && (
              <Button
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                nativeButton={false}
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground lg:justify-start">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              Synced securely, only for you
            </span>
            <span className="flex items-center gap-1.5">
              <WifiOff className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              No signal required
            </span>
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div
          className={cn(
            "relative w-full max-w-md flex-1 transition-all delay-150 duration-700",
            mounted ? "translate-y-0 opacity-100 rotate-0" : "translate-y-4 opacity-0 rotate-1",
          )}
        >
          <div className="overflow-hidden rounded-3xl bg-card p-5 shadow-2xl shadow-emerald-950/10 ring-1 ring-foreground/10">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total balance</p>
                <p className="text-2xl font-bold tabular-nums">$7,252.00</p>
              </div>
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="size-3.5" />
                +12%
              </span>
            </div>
            <div className="mb-4 flex h-28 items-end justify-between gap-2 rounded-xl bg-muted/40 p-3">
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="w-full flex-1 rounded-t-md bg-gradient-to-t from-emerald-500 to-teal-400 transition-[height] duration-700 ease-out"
                  style={{ height: mounted ? `${h}%` : "4%", transitionDelay: `${i * 70}ms` }}
                />
              ))}
            </div>
            <div className="space-y-2.5">
              {[
                { label: "Cash", value: "$342.00", color: "#10b981" },
                { label: "BDO Debit", value: "$8,150.00", color: "#0d9488" },
                { label: "Visa Credit", value: "-$1,240.00", color: "#ef4444" },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: row.color }}
                      aria-hidden
                    />
                    {row.label}
                  </span>
                  <span className="font-medium tabular-nums">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
          <Wallet className="absolute -top-5 -right-4 size-9 rounded-xl bg-white p-2 text-emerald-600 shadow-lg animate-float dark:bg-card" />
          <HandCoins className="absolute -bottom-4 -left-4 size-9 rounded-xl bg-white p-2 text-teal-600 shadow-lg animate-float-delayed dark:bg-card" />
        </div>
      </section>

      {/* Mascot */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="grid items-center gap-8 rounded-3xl bg-card p-8 ring-1 ring-foreground/10 sm:p-12 lg:grid-cols-[auto_1fr] lg:gap-12">
          <div className="relative mx-auto shrink-0">
            <div className="absolute inset-0 -z-10 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-400/30 blur-2xl" />
            <Image
              src="/mascot-owl.png"
              alt="Owlie, the Wais mascot, holding a clipboard, calculator, and a coin"
              width={856}
              height={712}
              className="h-auto w-44 drop-shadow-xl animate-float sm:w-56"
              priority
            />
          </div>
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400">
              <Sparkles className="size-3.5" />
              Meet the team
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight">Say hi to Owlie</h2>
            <p className="mx-auto mt-3 max-w-md text-muted-foreground lg:mx-0">
              Sharp-eyed, always crunching the numbers, and never without a calculator. Owlie
              keeps watch over your budget so nothing slips through — online or off.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="mx-auto mb-12 max-w-xl text-center">
          <h2 className="text-3xl font-bold tracking-tight">Everything your money needs, one app</h2>
          <p className="mt-3 text-muted-foreground">
            No spreadsheets, no separate apps for loans and accounts — just the parts of budgeting
            that actually matter.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="space-y-3 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 transition-shadow hover:shadow-md"
            >
              <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <feature.icon className="size-5" />
              </span>
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 px-8 py-14 text-center text-white shadow-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.2),_transparent_55%)]" />
          <div className="relative z-10 space-y-5">
            <h2 className="text-3xl font-bold text-balance">Ready to get your money in order?</h2>
            <p className="mx-auto max-w-md text-white/85">
              Free to use, works offline, and syncs the moment you&apos;re back online.
            </p>
            <Button
              size="lg"
              className="gap-1.5 border-none bg-white text-emerald-700 shadow-lg hover:bg-white/90"
              nativeButton={false} render={<Link href={primaryHref} />}
            >
              {primaryLabel}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 border-t px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <span className="flex size-5 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-extrabold text-white">
            W
          </span>
          Wais
        </div>
        <p>&copy; {new Date().getFullYear()} Wais. Track spending, even offline.</p>
      </footer>
    </div>
  );
}
