"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  Receipt,
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
} from "@/lib/format";
import type { Category, Transaction } from "@/lib/types";
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

export default function DashboardPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const [monthOffset, setMonthOffset] = useState(0);

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

  const budgets = useLiveQuery(
    () =>
      user
        ? db.budgets
            .where("user_id")
            .equals(user.id)
            .filter((b) => b.month === selectedMonth && !b.deleted_at)
            .toArray()
        : [],
    [user?.id, selectedMonth],
  );

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const monthlyTotals = useMemo(() => {
    const totals = new Map<string, { income: number; expense: number }>();
    for (const t of transactions ?? []) {
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

  const budgetOverview = useMemo(() => {
    const spentByCategory = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (t.type !== "expense" || !t.category_id) continue;
      if (t.occurred_at.slice(0, 7) !== selectedKey) continue;
      spentByCategory.set(t.category_id, (spentByCategory.get(t.category_id) ?? 0) + t.amount);
    }
    return (budgets ?? [])
      .map((b) => {
        const spent = spentByCategory.get(b.category_id) ?? 0;
        const pct = b.amount > 0 ? (spent / b.amount) * 100 : 0;
        return {
          id: b.id,
          category: categoryById.get(b.category_id),
          spent,
          amount: b.amount,
          pct: Math.min(100, pct),
          status: pct >= 100 ? "critical" : pct >= 80 ? "warning" : "good",
        } as const;
      })
      .sort((a, b) => b.pct - a.pct);
  }, [transactions, budgets, selectedKey, categoryById]);

  const recentTransactions = useMemo(() => {
    return [...(transactions ?? [])]
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
      .slice(0, 5);
  }, [transactions]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
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
          <CardContent>
            <BudgetOverview items={budgetOverview} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Recent activity</CardTitle>
          <Link
            href="/transactions"
            className="flex items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
          >
            View all <ArrowRight className="size-3" />
          </Link>
        </CardHeader>
        <CardContent>
          <RecentTransactions transactions={recentTransactions} categoryById={categoryById} />
        </CardContent>
      </Card>
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
  items: {
    id: string;
    category?: Category;
    spent: number;
    amount: number;
    pct: number;
    status: keyof typeof BUDGET_STATUS;
  }[];
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
              <span>{formatCurrency(item.amount, currency)} budget</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentTransactions({
  transactions,
  categoryById,
}: {
  transactions: Transaction[];
  categoryById: Map<string, Category>;
}) {
  const { currency } = useCurrency();

  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No transactions yet.{" "}
        <Link href="/transactions" className="text-emerald-600 hover:underline dark:text-emerald-400">
          Add your first one
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="divide-y">
      {transactions.map((t) => {
        const category = t.category_id ? categoryById.get(t.category_id) : undefined;
        return (
          <div key={t.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: category?.color ?? OTHER_COLOR }}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {t.description || (t.type === "income" ? "Income" : "Expense")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {category?.name ?? "Uncategorized"} ·{" "}
                  {new Date(t.occurred_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                t.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
              )}
            >
              {t.type === "income" ? "+" : "-"}
              {formatCurrency(t.amount, currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
