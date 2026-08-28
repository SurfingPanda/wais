"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-provider";
import { CURRENCIES, DEFAULT_CURRENCY } from "@/lib/currency";
import { STARTER_CATEGORIES, seedStarterCategories, nameFromEmail } from "@/lib/onboarding";
import { createAccount } from "@/lib/actions/accounts";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "checking", label: "Checking" },
  { value: "savings", label: "Savings" },
  { value: "debit_card", label: "Debit card" },
  { value: "credit_card", label: "Credit card" },
  { value: "other", label: "Other" },
];

const STEPS = ["You", "Categories", "First account"] as const;

const gradientButton =
  "group border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 hover:shadow-emerald-500/40 active:scale-[0.98]";

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);
  const [cats, setCats] = useState<string[]>(STARTER_CATEGORIES.map((c) => c.name));
  const [acctName, setAcctName] = useState("");
  const [acctType, setAcctType] = useState<AccountType>("cash");
  const [acctBalance, setAcctBalance] = useState("");
  const [busy, setBusy] = useState(false);

  // Bounce anyone who shouldn't be here, and seed the form from whatever the
  // account already has (currency/name may be set from a Google profile).
  const seeded = useRef(false);
  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.user_metadata?.onboarded) {
      router.replace("/dashboard");
      return;
    }
    if (!seeded.current) {
      seeded.current = true;
      setName(
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
          nameFromEmail(user.email),
      );
      setCurrency(
        (typeof user.user_metadata?.currency === "string" && user.user_metadata.currency) ||
          DEFAULT_CURRENCY,
      );
    }
  }, [loading, user, router]);

  function toggleCat(name: string) {
    setCats((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  async function finish(withAccount: boolean) {
    if (!user || busy) return;
    setBusy(true);
    try {
      await seedStarterCategories(user.id, cats);
      if (withAccount && acctName.trim()) {
        await createAccount(user.id, {
          name: acctName.trim(),
          type: acctType,
          starting_balance: acctBalance ? Number(acctBalance) : 0,
        });
      }
      // Categories/account are written locally first, but this metadata write
      // needs the network. If it fails, the app layout re-marks `onboarded`
      // on its own once it sees categories exist — so still move on.
      await supabase.auth.updateUser({
        data: {
          currency,
          onboarded: true,
          ...(name.trim() ? { full_name: name.trim() } : {}),
        },
      });
    } catch (err) {
      console.error("[onboarding]", err);
      toast.error("Saved your setup locally — some of it will sync once you're online.");
    } finally {
      router.replace("/dashboard");
    }
  }

  if (loading || !user || user.user_metadata?.onboarded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-emerald-50 via-background to-teal-50 p-4 dark:from-emerald-950/30 dark:via-background dark:to-teal-950/20">
      <div className="relative w-full max-w-md space-y-6 rounded-3xl bg-card p-8 ring-1 ring-emerald-500/10 shadow-2xl shadow-emerald-950/10">
        {/* Progress */}
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex flex-1 flex-col gap-1.5">
              <div
                className={cn(
                  "h-1 rounded-full transition-colors",
                  i <= step ? "bg-emerald-500" : "bg-muted",
                )}
              />
              <span
                className={cn(
                  "text-[11px] font-medium",
                  i === step ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-base font-extrabold text-white shadow-md shadow-emerald-500/30">
                W
              </div>
              <h1 className="text-xl font-semibold">Welcome to Wais</h1>
              <p className="text-sm text-muted-foreground">
                A minute of setup and your budget is ready to go.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ob-name">What should we call you?</Label>
              <Input
                id="ob-name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <div className="grid grid-cols-3 gap-2">
                {CURRENCIES.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-sm transition-colors",
                      currency === c.code
                        ? "border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300"
                        : "border-input hover:bg-muted",
                    )}
                  >
                    <span className="text-muted-foreground">{c.symbol}</span>
                    {c.code}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Pick your categories</h1>
              <p className="text-sm text-muted-foreground">
                Your spending buckets — for budgets and reports. Add, rename, or remove them any
                time.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {STARTER_CATEGORIES.map((c) => {
                const on = cats.includes(c.name);
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggleCat(c.name)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      on
                        ? "border-transparent bg-muted font-medium"
                        : "border-input text-muted-foreground hover:bg-muted/60",
                    )}
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: on ? c.color : "transparent", boxShadow: `inset 0 0 0 1.5px ${c.color}` }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              {cats.length} selected{cats.length === 0 ? " — you can add categories later" : ""}
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">Add your first account</h1>
              <p className="text-sm text-muted-foreground">
                Where your money lives — a wallet, a bank account, a card. Optional; skip if
                you&rsquo;d rather set this up later.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ob-acct-name">Account name</Label>
              <Input
                id="ob-acct-name"
                placeholder="e.g. BPI Debit"
                value={acctName}
                onChange={(e) => setAcctName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <div className="grid grid-cols-3 gap-2">
                {ACCOUNT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setAcctType(t.value)}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-sm transition-colors",
                      acctType === t.value
                        ? "border-emerald-500 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300"
                        : "border-input hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ob-acct-balance">Current balance</Label>
              <Input
                id="ob-acct-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={acctBalance}
                onChange={(e) => setAcctBalance(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {step === 0 ? (
            <button
              type="button"
              onClick={() => finish(false)}
              disabled={busy}
              className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              Skip for now
            </button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              disabled={busy}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
          )}

          {step < 2 ? (
            <Button type="button" className={cn("gap-1.5", gradientButton)} onClick={() => setStep((s) => s + 1)}>
              Continue <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => finish(false)}
              >
                Skip
              </Button>
              <Button
                type="button"
                className={cn("gap-1.5", gradientButton)}
                disabled={busy}
                onClick={() => finish(true)}
              >
                {busy ? (
                  "Setting up…"
                ) : (
                  <>
                    <Sparkles className="size-4" /> Finish setup
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
