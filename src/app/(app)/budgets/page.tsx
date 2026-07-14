"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { setBudget } from "@/lib/actions/budgets";
import { useCurrency } from "@/lib/currency";
import { currentMonth, monthLabel, formatCurrency } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function BudgetsPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();
  const month = currentMonth();

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
            .filter((b) => b.month === month && !b.deleted_at)
            .toArray()
        : [],
    [user?.id, month],
  );

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter(
              (t) => !t.deleted_at && t.type === "expense" && t.occurred_at.slice(0, 7) === month.slice(0, 7),
            )
            .toArray()
        : [],
    [user?.id, month],
  );

  const spentByCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (!t.category_id) continue;
      totals.set(t.category_id, (totals.get(t.category_id) ?? 0) + t.amount);
    }
    return totals;
  }, [transactions]);

  const budgetByCategory = useMemo(
    () => new Map((budgets ?? []).map((b) => [b.category_id, b])),
    [budgets],
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Budgets</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(month)}</p>
      </div>

      <div className="space-y-3">
        {categories?.map((category) => {
          const spent = spentByCategory.get(category.id) ?? 0;
          const budgetAmount = budgetByCategory.get(category.id)?.amount ?? 0;
          const pct = budgetAmount > 0 ? Math.min(100, (spent / budgetAmount) * 100) : 0;
          const over = budgetAmount > 0 && spent > budgetAmount;

          return (
            <Card key={category.id} className="space-y-3 px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: category.color }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{category.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`budget-${category.id}`} className="sr-only">
                    Budget for {category.name}
                  </Label>
                  <span className="text-xs text-muted-foreground">Budget</span>
                  <Input
                    key={budgetAmount}
                    id={`budget-${category.id}`}
                    type="number"
                    min="0"
                    step="1"
                    className="h-8 w-24"
                    defaultValue={budgetAmount || ""}
                    onBlur={(e) => {
                      const value = Number(e.target.value);
                      if (!Number.isNaN(value) && user) {
                        setBudget(user.id, category.id, month, value);
                      }
                    }}
                  />
                </div>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(spent, currency)} spent</span>
                {budgetAmount > 0 && (
                  <span>{formatCurrency(budgetAmount, currency)} budget</span>
                )}
              </div>
            </Card>
          );
        })}
        {categories?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add a category first, then set a monthly budget for it.
          </p>
        )}
      </div>
    </div>
  );
}
