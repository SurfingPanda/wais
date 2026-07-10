"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { currentMonth, monthLabel, formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { user } = useAuth();
  const month = currentMonth();

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at && t.occurred_at.slice(0, 7) === month.slice(0, 7))
            .toArray()
        : [],
    [user?.id, month],
  );

  const categories = useLiveQuery(
    () => (user ? db.categories.where("user_id").equals(user.id).toArray() : []),
    [user?.id],
  );
  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const { income, expense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions ?? []) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense };
  }, [transactions]);

  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (t.type !== "expense" || !t.category_id) continue;
      totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [transactions]);

  const maxCategoryTotal = byCategory[0]?.[1] ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(month)}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Income</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold text-emerald-600">
            {formatCurrency(income)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Expenses</CardTitle>
          </CardHeader>
          <CardContent className="text-lg font-semibold">{formatCurrency(expense)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-normal text-muted-foreground">Balance</CardTitle>
          </CardHeader>
          <CardContent
            className={`text-lg font-semibold ${income - expense < 0 ? "text-destructive" : ""}`}
          >
            {formatCurrency(income - expense)}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Spending by category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {byCategory.map(([categoryId, total]) => {
            const category = categoryById.get(categoryId);
            return (
              <div key={categoryId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: category?.color ?? "#94a3b8" }}
                      aria-hidden
                    />
                    {category?.name ?? "Uncategorized"}
                  </span>
                  <span className="text-muted-foreground">{formatCurrency(total)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${maxCategoryTotal > 0 ? (total / maxCategoryTotal) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
          {byCategory.length === 0 && (
            <p className="text-sm text-muted-foreground">No expenses recorded this month yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
