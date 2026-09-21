"use client";

import { useMemo, useState, type FormEvent, type ReactElement } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Link from "next/link";
import { ArrowLeftRight, Check, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { useHousehold } from "@/lib/household-provider";
import { belongsToHousehold } from "@/lib/household";
import { createTransaction } from "@/lib/actions/transactions";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { todayLocalDate } from "@/lib/format";
import type { Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type QuickType = Extract<TransactionType, "expense" | "income">;

const TYPE_STYLE: Record<QuickType, { label: string; icon: typeof TrendingDown; active: string; amount: string }> = {
  expense: {
    label: "Expense",
    icon: TrendingDown,
    active: "bg-rose-500 text-white shadow-sm shadow-rose-500/30",
    amount: "text-rose-600 dark:text-rose-400",
  },
  income: {
    label: "Income",
    icon: TrendingUp,
    active: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
    amount: "text-emerald-600 dark:text-emerald-400",
  },
};

function latestForType(transactions: Transaction[], type: QuickType) {
  return transactions.find((transaction) => transaction.type === type) ?? null;
}

export function QuickTransactionDialog({ trigger }: { trigger: ReactElement }) {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((item) => item.code === currency)?.symbol ?? "";
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<QuickType>("expense");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions.filter((transaction) => !transaction.deleted_at && belongsToHousehold(transaction, user.id, householdId)).toArray()
        : Promise.resolve([] as Transaction[]),
    [user?.id, householdId],
  );
  const categories = useLiveQuery(
    () => (user ? db.categories.filter((category) => !category.deleted_at && belongsToHousehold(category, user.id, householdId)).toArray() : []),
    [user?.id, householdId],
  );
  const accounts = useLiveQuery(
    () => (user ? db.accounts.filter((account) => !account.deleted_at && belongsToHousehold(account, user.id, householdId)).toArray() : []),
    [user?.id, householdId],
  );

  const recentTransactions = useMemo(
    () => [...(transactions ?? [])].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [transactions],
  );
  const recentCategories = useMemo(() => {
    const ids = new Set<string>();
    for (const transaction of recentTransactions) {
      if (transaction.type !== type || !transaction.category_id || ids.has(transaction.category_id)) continue;
      ids.add(transaction.category_id);
      if (ids.size === 4) break;
    }
    return (categories ?? []).filter((category) => ids.has(category.id));
  }, [categories, recentTransactions, type]);
  const recentAccounts = useMemo(() => {
    const ids = new Set<string>();
    for (const transaction of recentTransactions) {
      if (transaction.type !== type || !transaction.account_id || ids.has(transaction.account_id)) continue;
      ids.add(transaction.account_id);
      if (ids.size === 3) break;
    }
    return (accounts ?? []).filter((account) => ids.has(account.id));
  }, [accounts, recentTransactions, type]);

  function applyDefaults(nextType: QuickType) {
    const latest = latestForType(recentTransactions, nextType);
    setType(nextType);
    setAmount("");
    setDescription("");
    setCategoryId(latest?.category_id ?? "");
    setAccountId(latest?.account_id ?? "");
  }

  function handleOpenChange(next: boolean) {
    if (next) applyDefaults("expense");
    setOpen(next);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    try {
      await createTransaction(user.id, {
        amount: parsedAmount,
        type,
        description: description.trim(),
        category_id: categoryId || null,
        account_id: accountId || null,
        occurred_at: new Date(todayLocalDate()).toISOString(),
      });
      toast.success(`${TYPE_STYLE[type].label} added`);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const style = TYPE_STYLE[type];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick add</DialogTitle>
          <p className="text-sm text-muted-foreground">Saved with today&apos;s date. Use the full form for more details.</p>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(Object.keys(TYPE_STYLE) as QuickType[]).map((option) => {
              const meta = TYPE_STYLE[option];
              const Icon = meta.icon;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => applyDefaults(option)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all",
                    type === option ? meta.active : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" /> {meta.label}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-muted/65 px-4 py-5 text-center">
            <label htmlFor="quick-amount" className="sr-only">Amount</label>
            <div className="flex items-center justify-center gap-1">
              <span className={cn("text-2xl font-semibold", style.amount)}>{currencySymbol}</span>
              <Input
                id="quick-amount"
                autoFocus
                required
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className={cn(
                  "h-auto max-w-52 border-0 bg-transparent p-0 text-center text-4xl font-bold tabular-nums shadow-none placeholder:text-muted-foreground/35 focus-visible:ring-0",
                  style.amount,
                )}
              />
            </div>
          </div>

          <Input
            placeholder="What was this for? (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          {(recentCategories.length > 0 || recentAccounts.length > 0) && (
            <div className="space-y-3">
              {recentCategories.length > 0 && (
                <QuickChoices
                  label="Category"
                  choices={recentCategories.map((category) => ({ id: category.id, label: category.name, color: category.color }))}
                  value={categoryId}
                  onChange={setCategoryId}
                />
              )}
              {recentAccounts.length > 0 && (
                <QuickChoices
                  label="Account"
                  choices={recentAccounts.map((account) => ({ id: account.id, label: account.name }))}
                  value={accountId}
                  onChange={setAccountId}
                />
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:flex-col">
            <Button type="submit" disabled={saving} className="w-full gap-1.5">
              {saving ? <Check className="size-4" /> : <Plus className="size-4" />}
              {saving ? "Adding…" : `Add ${style.label.toLowerCase()}`}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full gap-1.5"
              onClick={() => setOpen(false)}
              nativeButton={false}
              render={<Link href="/transactions" />}
            >
              <ArrowLeftRight className="size-4" /> Open full transaction form
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuickChoices({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: { id: string; label: string; color?: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-14 text-xs font-medium text-muted-foreground">{label}</span>
      {choices.map((choice) => (
        <button
          key={choice.id}
          type="button"
          onClick={() => onChange(value === choice.id ? "" : choice.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === choice.id ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
          )}
        >
          {choice.color && <span className="size-2 rounded-full" style={{ backgroundColor: choice.color }} />}
          {choice.label}
        </button>
      ))}
    </div>
  );
}
