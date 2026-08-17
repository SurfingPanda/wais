"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Banknote,
  Check,
  CreditCard,
  Landmark,
  MoreVertical,
  PiggyBank,
  Plus,
  Tag,
  Wallet,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createAccount, updateAccount, deleteAccount, type AccountInput } from "@/lib/actions/accounts";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, shortDateLabel, todayLocalDate, currentMonth } from "@/lib/format";
import { computeAccountForecast } from "@/lib/forecast";
import { getNextOccurrence } from "@/lib/recurrence";
import { getLoanDueInfo } from "@/lib/loans";
import type { Account, AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof Wallet }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "checking", label: "Checking", icon: Landmark },
  { value: "savings", label: "Savings", icon: PiggyBank },
  { value: "debit_card", label: "Debit Card", icon: CreditCard },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "other", label: "Other", icon: Wallet },
];

function accountTypeMeta(type: AccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}

const ACCOUNT_CARD_GRADIENTS: Record<AccountType, string> = {
  cash: "from-emerald-500 via-emerald-600 to-teal-700",
  checking: "from-sky-500 via-sky-600 to-blue-700",
  savings: "from-amber-500 via-orange-500 to-orange-600",
  debit_card: "from-indigo-500 via-violet-600 to-purple-700",
  credit_card: "from-slate-700 via-slate-800 to-neutral-950",
  other: "from-zinc-500 via-zinc-600 to-zinc-700",
};

// A distinct texture per category so cards read as different "designs," not
// just different colors — cash gets bill-like diagonal ruling, checking a
// ledger grid, savings a coin-dot pattern, cards a fine diagonal weave.
const ACCOUNT_CARD_PATTERNS: Record<AccountType, string> = {
  cash: "bg-[repeating-linear-gradient(45deg,rgba(255,255,255,0.10)_0px,rgba(255,255,255,0.10)_2px,transparent_2px,transparent_14px)]",
  checking:
    "bg-[linear-gradient(rgba(255,255,255,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.10)_1px,transparent_1px)] bg-[size:20px_20px]",
  savings:
    "bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.16)_1.5px,transparent_1.5px)] bg-[size:16px_16px]",
  debit_card:
    "bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.10)_0px,rgba(255,255,255,0.10)_1px,transparent_1px,transparent_9px)]",
  credit_card:
    "bg-[repeating-linear-gradient(115deg,rgba(255,255,255,0.07)_0px,rgba(255,255,255,0.07)_1px,transparent_1px,transparent_9px)]",
  other: "bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1.5px,transparent_1.5px)] bg-[size:22px_22px]",
};

// Flat accent per type for small UI chrome (dialog header badge, amount box)
// where the multi-stop card gradient above would be too busy.
const ACCOUNT_TYPE_ACCENT: Record<AccountType, { text: string; softBg: string }> = {
  cash: { text: "text-emerald-500 dark:text-emerald-400", softBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20" },
  checking: { text: "text-sky-500 dark:text-sky-400", softBg: "bg-sky-500/10 ring-1 ring-sky-500/20" },
  savings: { text: "text-amber-500 dark:text-amber-400", softBg: "bg-amber-500/10 ring-1 ring-amber-500/20" },
  debit_card: { text: "text-indigo-500 dark:text-indigo-400", softBg: "bg-indigo-500/10 ring-1 ring-indigo-500/20" },
  credit_card: { text: "text-slate-500 dark:text-slate-400", softBg: "bg-slate-500/10 ring-1 ring-slate-500/20" },
  other: { text: "text-zinc-500 dark:text-zinc-400", softBg: "bg-zinc-500/10 ring-1 ring-zinc-500/20" },
};

const CARD_TYPES = new Set<AccountType>(["debit_card", "credit_card"]);

// Fraction of a card's own height that peeks out from behind the card above
// it in the stack. Kept as a fraction (not px) so the stack stays correctly
// proportioned at any container width.
const STACK_PEEK_FRACTION = 0.34;

function stackMultiplier(count: number) {
  return 1 + Math.max(0, count - 1) * STACK_PEEK_FRACTION;
}

export default function AccountsPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  const accounts = useLiveQuery(
    () =>
      user
        ? db.accounts.where("user_id").equals(user.id).filter((a) => !a.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at && !!t.account_id)
            .toArray()
        : [],
    [user?.id],
  );

  const netByAccount = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (t.type === "transfer") {
        // Moves money between two of the user's own accounts — reduces the
        // source, increases the destination, and never touches income/expense.
        if (t.account_id) totals.set(t.account_id, (totals.get(t.account_id) ?? 0) - t.amount);
        if (t.to_account_id) totals.set(t.to_account_id, (totals.get(t.to_account_id) ?? 0) + t.amount);
        continue;
      }
      if (!t.account_id) continue;
      const delta = t.type === "income" ? t.amount : -t.amount;
      totals.set(t.account_id, (totals.get(t.account_id) ?? 0) + delta);
    }
    return totals;
  }, [transactions]);

  const totalBalance = useMemo(
    () =>
      (accounts ?? []).reduce(
        (sum, a) => sum + a.starting_balance + (netByAccount.get(a.id) ?? 0),
        0,
      ),
    [accounts, netByAccount],
  );

  const forecastByAccount = useMemo(() => {
    const today = todayLocalDate();
    const map = new Map<string, ReturnType<typeof computeAccountForecast>>();
    for (const account of accounts ?? []) {
      const balance = account.starting_balance + (netByAccount.get(account.id) ?? 0);
      map.set(account.id, computeAccountForecast(account.id, balance, transactions ?? [], today));
    }
    return map;
  }, [accounts, netByAccount, transactions]);

  const projectedTotal = useMemo(
    () =>
      (accounts ?? []).reduce(
        (sum, a) => sum + (forecastByAccount.get(a.id)?.projectedBalance ?? 0),
        0,
      ),
    [accounts, forecastByAccount],
  );

  const recurringRules = useLiveQuery(
    () =>
      user
        ? db.recurring_transactions
            .where("user_id")
            .equals(user.id)
            .filter((r) => !r.deleted_at)
            .toArray()
        : [],
    [user?.id],
  );

  const loans = useLiveQuery(
    () =>
      user
        ? db.loans.where("user_id").equals(user.id).filter((l) => !l.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const loanPayments = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at && !!t.loan_id)
            .toArray()
        : [],
    [user?.id],
  );

  const paidByLoan = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of loanPayments ?? []) {
      if (!t.loan_id) continue;
      totals.set(t.loan_id, (totals.get(t.loan_id) ?? 0) + t.amount);
    }
    return totals;
  }, [loanPayments]);

  const paidThisMonthLoanIds = useMemo(() => {
    const thisMonth = currentMonth().slice(0, 7);
    const ids = new Set<string>();
    for (const t of loanPayments ?? []) {
      if (t.loan_id && t.occurred_at.slice(0, 7) === thisMonth) ids.add(t.loan_id);
    }
    return ids;
  }, [loanPayments]);

  const upcomingItems = useMemo(() => {
    const today = todayLocalDate();
    const withinDays = 14;
    const cutoff = new Date(`${today}T00:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() + withinDays);
    const cutoffDate = cutoff.toISOString().slice(0, 10);

    const items: { date: string; label: string; amount: number; type: "income" | "expense" }[] = [];

    for (const rule of recurringRules ?? []) {
      const next = getNextOccurrence(rule);
      if (next && next >= today && next <= cutoffDate) {
        items.push({
          date: next,
          label: rule.description || "Untitled",
          amount: rule.amount,
          type: rule.type === "income" ? "income" : "expense",
        });
      }
    }

    for (const loan of loans ?? []) {
      const paid = paidByLoan.get(loan.id) ?? 0;
      const paidOff = loan.principal - paid <= 0;
      const cyclePaid =
        paidOff || (loan.payment_type === "recurring" && paidThisMonthLoanIds.has(loan.id));
      const dueInfo = getLoanDueInfo(loan, cyclePaid);
      if (dueInfo?.date && dueInfo.date >= today && dueInfo.date <= cutoffDate) {
        items.push({
          date: dueInfo.date,
          label: loan.name,
          amount: loan.payment_type === "recurring" ? (loan.monthly_payment ?? 0) : loan.principal - paid,
          type: "expense",
        });
      }
    }

    return items.sort((a, b) => a.date.localeCompare(b.date));
  }, [recurringRules, loans, paidByLoan, paidThisMonthLoanIds]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          {(accounts?.length ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatCurrency(totalBalance, currency)} total ·{" "}
              {formatCurrency(projectedTotal, currency)} projected in 30 days
            </p>
          )}
        </div>
        {user && <AccountDialog userId={user.id} />}
      </div>

      <div
        className="relative mx-auto w-full max-w-[420px]"
        style={
          accounts?.length
            ? { aspectRatio: `16 / ${(10 * stackMultiplier(accounts.length)).toFixed(3)}` }
            : undefined
        }
      >
        {accounts?.map((account, i) => {
          const multiplier = stackMultiplier(accounts.length);
          const isActive = activeAccountId === account.id;
          return (
            <div
              key={account.id}
              onClick={() =>
                setActiveAccountId((current) => (current === account.id ? null : account.id))
              }
              className="absolute inset-x-0 cursor-pointer transition-[top] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{
                top: `${isActive ? 0 : (i * STACK_PEEK_FRACTION * 100) / multiplier}%`,
                height: `${100 / multiplier}%`,
                zIndex: isActive ? 999 : accounts.length - i,
              }}
            >
              <AccountCard
                userId={user!.id}
                account={account}
                balance={account.starting_balance + (netByAccount.get(account.id) ?? 0)}
                lowBalanceDate={forecastByAccount.get(account.id)?.lowBalanceDate ?? null}
              />
            </div>
          );
        })}
        {accounts?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No accounts yet. Add one for each place your money lives — cash, a debit card, a
            credit card — and tag transactions to it to track its balance.
          </p>
        )}
      </div>

      {upcomingItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">Upcoming</h2>
          <div className="space-y-1.5">
            {upcomingItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {shortDateLabel(item.date)}
                  </span>
                  <span className="truncate">{item.label}</span>
                </div>
                <span
                  className={cn(
                    "shrink-0 font-medium tabular-nums",
                    item.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                  )}
                >
                  {item.type === "income" ? "+" : "-"}
                  {formatCurrency(item.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AccountCard({
  userId,
  account,
  balance,
  lowBalanceDate,
}: {
  userId: string;
  account: Account;
  balance: number;
  lowBalanceDate?: string | null;
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);
  const meta = accountTypeMeta(account.type);
  const Icon = meta.icon;
  const negative = balance < 0;
  const isCardType = CARD_TYPES.has(account.type);

  return (
    <Card
      className={cn(
        "relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br p-4 text-white shadow-xl shadow-black/25 ring-1 ring-white/10 transition-[transform,box-shadow,filter] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:scale-[1.03] hover:shadow-2xl hover:shadow-black/40 hover:brightness-110",
        ACCOUNT_CARD_GRADIENTS[account.type] ?? ACCOUNT_CARD_GRADIENTS.other,
      )}
    >
      {/* Card-like flourishes: a per-category texture, soft glows, a diagonal
          sheen, and a faint watermark of the account-type icon so each
          category reads as its own physical card design. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-0",
          ACCOUNT_CARD_PATTERNS[account.type] ?? ACCOUNT_CARD_PATTERNS.other,
        )}
      />
      <div className="pointer-events-none absolute -top-10 -right-8 size-32 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-10 size-32 rounded-full bg-black/10 blur-2xl" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,transparent_38%,rgba(255,255,255,0.12)_50%,transparent_62%)]" />
      <Icon className="pointer-events-none absolute top-1/2 -right-4 size-28 -translate-y-1/2 rotate-12 text-white/10" />

      <div className="relative flex items-start justify-between">
        {isCardType ? (
          <span className="flex h-7 w-10 items-center justify-center rounded-[6px] bg-gradient-to-br from-yellow-200 via-yellow-300 to-yellow-500 ring-1 ring-black/10">
            <span className="h-4 w-6 rounded-[3px] border border-yellow-700/30" />
          </span>
        ) : (
          <span className="flex size-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
            <Icon className="size-4.5" />
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1 -mr-1.5 h-7 w-7 text-white/80 hover:bg-white/15 hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {/* The dialog lives outside the menu (below) — opening it from
                inside the menu would unmount it when the menu closes. */}
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => deleteAccount(userId, account.id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountDialog
          userId={userId}
          account={account}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </div>

      <div className="relative flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold tracking-wide">{account.name}</p>
          <p className="text-[11px] font-medium tracking-[0.15em] text-white/70 uppercase">
            {meta.label}
          </p>
          {lowBalanceDate && (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-rose-200">
              <AlertTriangle className="size-3" />
              May drop below {formatCurrency(0, currency)} around {shortDateLabel(lowBalanceDate)}
            </p>
          )}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-medium tracking-widest text-white/60 uppercase">
            Balance
          </p>
          <p
            className={cn(
              "text-xl font-bold tabular-nums",
              negative ? "text-rose-200" : "text-white",
            )}
          >
            {formatCurrency(balance, currency)}
          </p>
        </div>
      </div>
    </Card>
  );
}

function AccountDialog({
  userId,
  account,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  account?: Account;
  // When provided, the dialog is controlled by the parent (e.g. opened from
  // a menu item) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "cash");
  const [startingBalance, setStartingBalance] = useState(
    account ? String(account.starting_balance) : "",
  );
  const accent = ACCOUNT_TYPE_ACCENT[type];
  const TypeIcon = accountTypeMeta(type).icon;

  // The dialog stays mounted between opens, so re-seed the form from the
  // current account each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(account?.name ?? "");
      setType(account?.type ?? "cash");
      setStartingBalance(account ? String(account.starting_balance) : "");
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: AccountInput = {
      name,
      type,
      starting_balance: startingBalance ? Number(startingBalance) : 0,
    };

    if (account) {
      await updateAccount(userId, account.id, input);
    } else {
      await createAccount(userId, input);
      setName("");
      setStartingBalance("");
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Account
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                accent.softBg,
              )}
            >
              <TypeIcon className={cn("size-4", accent.text)} />
            </span>
            <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="account-name">Name</Label>
            <div className="relative">
              <Tag className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="account-name"
                required
                placeholder="e.g. BDO Debit"
                className="pl-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => value && setType(value as AccountType)}>
              <SelectTrigger className="w-full">
                <SelectValue className="gap-1.5">
                  {(value: AccountType) => {
                    const meta = accountTypeMeta(value);
                    const ValueIcon = meta.icon;
                    return (
                      <>
                        <ValueIcon className="size-4 text-muted-foreground" />
                        {meta.label}
                      </>
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => {
                  const ItemIcon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <ItemIcon className="size-4 text-muted-foreground" />
                      {t.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-balance">
              {account ? "Starting balance" : "Current balance"}
            </Label>
            <div
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border border-input px-4 py-4 transition-colors",
                accent.softBg,
              )}
            >
              <span className={cn("text-2xl font-semibold", accent.text)}>{currencySymbol}</span>
              <Input
                id="account-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                placeholder="0.00"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                className={cn(
                  "h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0",
                  accent.text,
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {account
                ? "Adjusting this shifts the balance without adding a transaction."
                : "Transactions you tag to this account will move the balance from here."}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className={cn(
                "w-full gap-1.5 border-none bg-gradient-to-r text-white shadow-md transition-all active:scale-[0.98]",
                ACCOUNT_CARD_GRADIENTS[type],
              )}
            >
              {account ? <Check className="size-4" /> : <Plus className="size-4" />}
              {account ? "Save changes" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
