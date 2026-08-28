"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  HandCoins,
  PiggyBank,
  Receipt,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { useCurrency } from "@/lib/currency";
import {
  addMonths,
  currentMonth,
  formatCurrency,
  formatPercent,
  monthLabel,
  shortMonthLabel,
  todayLocalDate,
} from "@/lib/format";
import { computeBudgetStreak, type BudgetStreak } from "@/lib/streak";
import {
  computeCategoryBudgetHealth,
  type CategoryBudgetHealth,
} from "@/lib/budget-health";
import { computeGoalHealth } from "@/lib/goal-health";
import { computeRestockInfo } from "@/lib/grocery-restock";
import type { Category } from "@/lib/types";
import { TransactionDialog } from "@/components/transaction-dialog";
import { GroceryReceiptDialog } from "@/components/grocery-receipt-dialog";
import { OwlieTip } from "@/components/owlie";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OTHER_COLOR = "#94a3b8";

function monthKey(month: string) {
  return month.slice(0, 7);
}

function percentDelta(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Prefer the name the user set on the profile page (Supabase user metadata),
// and only fall back to the email local-part when they haven't set one.
function displayName(user: User | null | undefined): string {
  const fullName = user?.user_metadata?.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();

  const email = user?.email;
  if (!email) return "there";
  const local = email.split("@")[0] || "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [monthOffset, setMonthOffset] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickReceiptOpen, setQuickReceiptOpen] = useState(false);

  const realCurrentMonth = currentMonth();
  const selectedMonth = addMonths(realCurrentMonth, monthOffset);
  const previousMonth = addMonths(selectedMonth, -1);
  const selectedKey = monthKey(selectedMonth);
  const previousKey = monthKey(previousMonth);
  const canGoNext = selectedMonth < realCurrentMonth;

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions.where("user_id").equals(user.id).filter((t) => !t.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const categories = useLiveQuery(
    () =>
      user
        ? db.categories.where("user_id").equals(user.id).filter((c) => !c.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const accounts = useLiveQuery(
    () =>
      user
        ? db.accounts.where("user_id").equals(user.id).filter((a) => !a.deleted_at).toArray()
        : [],
    [user?.id],
  );

  // Loaded unscoped (not just selectedMonth) because both the streak and the
  // rollover-aware budget-health widget need every prior month on record.
  const allBudgets = useLiveQuery(
    () =>
      user
        ? db.budgets.where("user_id").equals(user.id).filter((b) => !b.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const goals = useLiveQuery(
    () =>
      user
        ? db.savings_goals.where("user_id").equals(user.id).filter((g) => !g.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const groceryItems = useLiveQuery(
    () =>
      user
        ? db.grocery_items.where("user_id").equals(user.id).filter((i) => !i.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const groceryPurchases = useLiveQuery(
    () =>
      user
        ? db.grocery_purchases.where("user_id").equals(user.id).filter((p) => !p.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    for (const t of transactions ?? []) {
      // Transfers move money between the user's own accounts — they're
      // neither income nor expense.
      if (t.type === "transfer") continue;
      const key = t.occurred_at.slice(0, 7);
      const entry = totals.get(key) ?? { income: 0, expense: 0 };
      if (t.type === "income") entry.income += t.amount;
      else entry.expense += t.amount;
      totals.set(key, entry);
    }
    return totals;
  }, [transactions]);

  const selectedTotals = monthlyTotals.get(selectedKey) ?? { income: 0, expense: 0 };
  const previousTotals = monthlyTotals.get(previousKey) ?? { income: 0, expense: 0 };
  const balance = selectedTotals.income - selectedTotals.expense;
  const previousBalance = previousTotals.income - previousTotals.expense;
  const savingsRate = selectedTotals.income > 0 ? (balance / selectedTotals.income) * 100 : 0;
  const previousSavingsRate =
    previousTotals.income > 0 ? (previousBalance / previousTotals.income) * 100 : 0;

  const last6Months = useMemo(() => {
    return Array.from({ length: 6 }, (_, i) => {
      const m = addMonths(selectedMonth, i - 5);
      const key = monthKey(m);
      const totals = monthlyTotals.get(key) ?? { income: 0, expense: 0 };
      return { key, label: shortMonthLabel(m), ...totals };
    });
  }, [selectedMonth, monthlyTotals]);

  const categoryBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (t.type !== "expense" || !t.category_id) continue;
      if (t.occurred_at.slice(0, 7) !== selectedKey) continue;
      totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount);
    }
    const sorted = [...totals.entries()]
      .map(([id, amount]) => ({ id, amount, category: categoryById.get(id) }))
      .sort((a, b) => b.amount - a.amount);

    const top = sorted.slice(0, 7);
    const rest = sorted.slice(7);
    const restTotal = rest.reduce((sum, r) => sum + r.amount, 0);
    const total = sorted.reduce((sum, r) => sum + r.amount, 0);

    const items = top.map((r) => ({
      id: r.id,
      name: r.category?.name ?? "Uncategorized",
      color: r.category?.color ?? OTHER_COLOR,
      amount: r.amount,
      pct: total > 0 ? (r.amount / total) * 100 : 0,
    }));
    if (restTotal > 0) {
      items.push({
        id: "__other",
        name: "Other",
        color: OTHER_COLOR,
        amount: restTotal,
        pct: total > 0 ? (restTotal / total) * 100 : 0,
      });
    }
    return { items, total };
  }, [transactions, selectedKey, categoryById]);

  // Rollover-aware: a category counts as relevant for the browsed month if
  // it has a budget row that month OR has rollover enabled (in which case a
  // carried-in balance can make it worth showing even with no new budget
  // set this month).
  const budgetOverview = useMemo(() => {
    const budgetedThisMonth = new Set(
      (allBudgets ?? []).filter((b) => b.month.slice(0, 7) === selectedKey).map((b) => b.category_id),
    );
    const rolloverCategoryIds = (categories ?? []).filter((c) => c.rollover).map((c) => c.id);
    const relevantCategoryIds = new Set([...budgetedThisMonth, ...rolloverCategoryIds]);

    return Array.from(relevantCategoryIds)
      .map((categoryId) => {
        const category = categoryById.get(categoryId);
        if (!category) return null;
        const health = computeCategoryBudgetHealth(
          category,
          selectedKey,
          allBudgets ?? [],
          transactions ?? [],
          todayLocalDate(),
        );
        if (health.available <= 0 && health.spent === 0) return null;
        return { id: categoryId, category, ...health };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.pct - a.pct);
  }, [transactions, allBudgets, categories, selectedKey, categoryById]);

  // Unlike budgets, goal progress isn't scoped to the browsed month — a
  // contribution from any time counts toward the target.
  const goalOverview = useMemo(() => {
    const contributedByGoal = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (!t.goal_id) continue;
      contributedByGoal.set(t.goal_id, (contributedByGoal.get(t.goal_id) ?? 0) + t.amount);
    }
    return (goals ?? [])
      .map((g) => {
        const contributed = contributedByGoal.get(g.id) ?? 0;
        const health = computeGoalHealth(g, contributed, todayLocalDate());
        return {
          id: g.id,
          goal: g,
          name: g.name,
          contributed,
          target: g.target_amount,
          pct: health.pct,
          reached: health.reached,
          health,
        };
      })
      .sort((a, b) => b.pct - a.pct);
  }, [transactions, goals]);

  // Not scoped to the browsed month either — restock timing is about real
  // purchase history, not the month being reviewed.
  const groceryWithInfo = useMemo(() => {
    const today = todayLocalDate();
    return (groceryItems ?? []).map((item) => ({
      item,
      info: computeRestockInfo(
        item,
        (groceryPurchases ?? []).filter((p) => p.grocery_item_id === item.id),
        today,
      ),
    }));
  }, [groceryItems, groceryPurchases]);

  const streak = useMemo(
    () => computeBudgetStreak(transactions ?? [], allBudgets ?? [], todayLocalDate()),
    [transactions, allBudgets],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {greeting()}, {displayName(user)}
          </h1>
          <p className="text-sm text-muted-foreground">{monthLabel(selectedMonth)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setMonthOffset((o) => o - 1)}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setMonthOffset((o) => o + 1)}
            disabled={!canGoNext}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <QuickActionTile
          label="Transaction"
          icon={Wallet}
          tone="emerald"
          onClick={() => setQuickAddOpen(true)}
        />
        <QuickActionTile
          label="Receipt"
          icon={Receipt}
          tone="lime"
          onClick={() => setQuickReceiptOpen(true)}
        />
        <QuickActionTile label="Goal" icon={Target} tone="violet" href="/goals" />
        <QuickActionTile label="Loan" icon={HandCoins} tone="amber" href="/loans" />
      </div>
      {user && (
        <TransactionDialog
          userId={user.id}
          categories={categories ?? []}
          accounts={accounts ?? []}
          open={quickAddOpen}
          onOpenChange={setQuickAddOpen}
        />
      )}
      {user && (
        <GroceryReceiptDialog
          userId={user.id}
          items={groceryWithInfo.map(({ item, info }) => ({
            id: item.id,
            name: item.name,
            lastPrice: info.lastPrice,
          }))}
          open={quickReceiptOpen}
          onOpenChange={setQuickReceiptOpen}
        />
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Income"
          value={formatCurrency(selectedTotals.income, currency)}
          icon={Wallet}
          tone="emerald"
          delta={percentDelta(selectedTotals.income, previousTotals.income)}
        />
        <StatCard
          label="Expenses"
          value={formatCurrency(selectedTotals.expense, currency)}
          icon={Receipt}
          tone="teal"
          delta={percentDelta(selectedTotals.expense, previousTotals.expense)}
          invertDelta
        />
        <StatCard
          label="Balance"
          value={formatCurrency(balance, currency)}
          icon={PiggyBank}
          tone={balance < 0 ? "red" : "violet"}
          delta={percentDelta(balance, previousBalance)}
        />
        <StatCard
          label="Savings rate"
          value={formatPercent(savingsRate, 0)}
          icon={TrendingUp}
          tone="amber"
          delta={
            previousSavingsRate === 0 && savingsRate === 0
              ? 0
              : savingsRate - previousSavingsRate
          }
          isPoint
        />
      </div>

      {monthOffset === 0 && <BudgetStreakCard streak={streak} />}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <CardTitle className="text-sm">Income vs expenses</CardTitle>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-teal-600" /> Expenses
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <TrendChart months={last6Months} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBreakdown items={categoryBreakdown.items} total={categoryBreakdown.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Budget health</CardTitle>
            <Link
              href="/budgets"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <BudgetOverview items={budgetOverview} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm">Savings goals</CardTitle>
            <Link
              href="/goals"
              className="flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
            >
              View all <ArrowRight className="size-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-3">
            <GoalOverview items={goalOverview} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const TONE_STYLES = {
  emerald: {
    bg: "bg-emerald-500/10 dark:bg-emerald-400/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    value: "text-emerald-700 dark:text-emerald-400",
  },
  teal: {
    bg: "bg-teal-500/10 dark:bg-teal-400/10",
    icon: "text-teal-700 dark:text-teal-400",
    value: "text-foreground",
  },
  violet: {
    bg: "bg-violet-500/10 dark:bg-violet-400/10",
    icon: "text-violet-600 dark:text-violet-400",
    value: "text-foreground",
  },
  amber: {
    bg: "bg-amber-500/10 dark:bg-amber-400/10",
    icon: "text-amber-600 dark:text-amber-400",
    value: "text-foreground",
  },
  red: {
    bg: "bg-red-500/10 dark:bg-red-400/10",
    icon: "text-red-600 dark:text-red-400",
    value: "text-red-600 dark:text-red-400",
  },
  lime: {
    bg: "bg-lime-500/10 dark:bg-lime-400/10",
    icon: "text-lime-600 dark:text-lime-400",
    value: "text-foreground",
  },
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  delta,
  invertDelta = false,
  isPoint = false,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: keyof typeof TONE_STYLES;
  delta: number | null;
  invertDelta?: boolean;
  isPoint?: boolean;
}) {
  const styles = TONE_STYLES[tone];
  const isGood = delta !== null && (invertDelta ? delta <= 0 : delta >= 0);

  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2 px-4 py-3.5">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn("text-lg font-semibold tabular-nums", styles.value)}>{value}</p>
          {delta !== null && (
            <p
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                isGood ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {delta >= 0 ? (
                <TrendingUp className="size-3" />
              ) : (
                <TrendingDown className="size-3" />
              )}
              {formatPercent(delta, 0)}
              {isPoint ? " pts" : ""}
              <span className="hidden lg:inline"> vs last month</span>
            </p>
          )}
        </div>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", styles.bg)}>
          <Icon className={cn("size-4", styles.icon)} />
        </span>
      </CardContent>
    </Card>
  );
}

function QuickActionTile({
  label,
  icon: Icon,
  tone,
  onClick,
  href,
}: {
  label: string;
  icon: typeof Wallet;
  tone: keyof typeof TONE_STYLES;
  onClick?: () => void;
  href?: string;
}) {
  const styles = TONE_STYLES[tone];
  const className =
    "flex flex-col items-center gap-2 rounded-2xl border border-border/60 bg-card px-2 py-3.5 text-center transition-all hover:bg-accent active:scale-[0.97]";
  const inner = (
    <>
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", styles.bg)}>
        <Icon className={cn("size-5", styles.icon)} />
      </span>
      <span className="text-xs font-medium">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

function BudgetStreakCard({ streak }: { streak: BudgetStreak }) {
  if (streak.todayStatus === "no-budget") {
    return (
      <Card>
        <CardContent className="px-4 py-3.5">
          <OwlieTip tone="neutral" size="sm">
            <Link href="/budgets" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
              Set a budget
            </Link>{" "}
            for this month to start a streak.
          </OwlieTip>
        </CardContent>
      </Card>
    );
  }

  const onTrack = streak.todayStatus === "under";

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 dark:bg-amber-400/10">
            <Flame className="size-4 text-amber-600 dark:text-amber-400" />
          </span>
          <div>
            <p className="text-lg font-semibold tabular-nums">
              {streak.current} {streak.current === 1 ? "day" : "days"} on budget
            </p>
            <p className="text-xs text-muted-foreground">
              {onTrack ? "Under budget today — keep it going!" : "Over budget today — streak resets tonight."}
            </p>
          </div>
        </div>
        {streak.best > 0 && (
          <span className="shrink-0 text-xs text-muted-foreground">Best {streak.best}d</span>
        )}
      </CardContent>
    </Card>
  );
}

function TrendChart({
  months,
}: {
  months: { key: string; label: string; income: number; expense: number }[];
}) {
  const { currency } = useCurrency();
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));

  return (
    <div className="space-y-2">
      <div className="flex h-40 items-end justify-between gap-2">
        {months.map((m, i) => (
          <div
            key={m.key}
            className="relative flex h-full flex-1 flex-col items-center justify-end gap-1"
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive((a) => (a === i ? null : a))}
          >
            {active === i && (
              <div
                className={cn(
                  "pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-lg bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg",
                  i === 0
                    ? "left-0"
                    : i === months.length - 1
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2",
                )}
              >
                <p className="font-medium">{monthLabel(`${m.key}-01`)}</p>
                <p className="text-background/80">Income {formatCurrency(m.income, currency)}</p>
                <p className="text-background/80">Expenses {formatCurrency(m.expense, currency)}</p>
              </div>
            )}
            <div className="flex h-full w-full items-end justify-center gap-[3px]">
              <div
                className={cn(
                  "w-full max-w-3.5 rounded-t-sm bg-emerald-500 transition-[height,opacity] duration-300",
                  active !== null && active !== i && "opacity-40",
                )}
                style={{ height: `${Math.max(2, (m.income / max) * 100)}%` }}
              />
              <div
                className={cn(
                  "w-full max-w-3.5 rounded-t-sm bg-teal-600 transition-[height,opacity] duration-300",
                  active !== null && active !== i && "opacity-40",
                )}
                style={{ height: `${Math.max(2, (m.expense / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        {months.map((m, i) => (
          <span
            key={m.key}
            className={cn(
              "flex-1 text-center text-xs text-muted-foreground",
              active === i && "font-medium text-foreground",
            )}
          >
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function CategoryBreakdown({
  items,
  total,
}: {
  items: { id: string; name: string; color: string; amount: number; pct: number }[];
  total: number;
}) {
  const { currency } = useCurrency();

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No expenses recorded this month yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {items.map((item, i) => (
          <div
            key={item.id}
            style={{
              width: `${item.pct}%`,
              backgroundColor: item.color,
              marginRight: i < items.length - 1 ? 2 : 0,
            }}
          />
        ))}
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className="truncate">{item.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 tabular-nums">
              <span className="text-xs text-muted-foreground">{formatPercent(item.pct, 0)}</span>
              <span className="font-medium">{formatCurrency(item.amount, currency)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t pt-2.5 text-sm font-medium">
        <span>Total</span>
        <span className="tabular-nums">{formatCurrency(total, currency)}</span>
      </div>
    </div>
  );
}

const BUDGET_STATUS = {
  good: {
    fill: "bg-emerald-500",
    icon: CheckCircle2,
    text: "text-emerald-600 dark:text-emerald-400",
    label: "On track",
  },
  warning: {
    fill: "bg-amber-500",
    icon: AlertTriangle,
    text: "text-amber-600 dark:text-amber-400",
    label: "Near limit",
  },
  critical: {
    fill: "bg-red-500",
    icon: XCircle,
    text: "text-red-600 dark:text-red-400",
    label: "Over budget",
  },
} as const;

function BudgetOverview({
  items,
}: {
  items: (CategoryBudgetHealth & { id: string; category?: Category })[];
}) {
  const { currency } = useCurrency();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No budgets set for this month yet. Set one from the Budgets tab.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {items.slice(0, 4).map((item) => {
        const status = BUDGET_STATUS[item.status];
        const StatusIcon = status.icon;
        return (
          <div key={item.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: item.category?.color ?? OTHER_COLOR }}
                  aria-hidden
                />
                {item.category?.name ?? "Uncategorized"}
              </span>
              <span className={cn("flex items-center gap-1 text-xs font-medium", status.text)}>
                <StatusIcon className="size-3.5" />
                {status.label}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", status.fill)}
                style={{ width: `${item.pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(item.spent, currency)} spent</span>
              <span>
                {formatCurrency(item.available, currency)}
                {item.carryIn !== 0 ? " available" : " budget"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoalOverview({
  items,
}: {
  items: { id: string; name: string; contributed: number; target: number; pct: number; reached: boolean }[];
}) {
  const { currency } = useCurrency();

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No savings goals yet. Set one from the Goals tab.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {items.slice(0, 4).map((item) => (
        <div key={item.id} className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span>{item.name}</span>
            <span
              className={cn(
                "flex items-center gap-1 text-xs font-medium",
                item.reached ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {item.reached ? <CheckCircle2 className="size-3.5" /> : <PiggyBank className="size-3.5" />}
              {item.reached ? "Reached" : "In progress"}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full transition-all", item.reached ? "bg-emerald-500" : "bg-teal-600")}
              style={{ width: `${item.pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(item.contributed, currency)} saved</span>
            <span>{formatCurrency(item.target, currency)} target</span>
          </div>
        </div>
      ))}
    </div>
  );
}

