"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowDownRight, ArrowUpRight, Repeat } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { setBudget } from "@/lib/actions/budgets";
import { computeCategoryBudget } from "@/lib/budgets";
import { useCurrency } from "@/lib/currency";
import { currentMonth, monthLabel, formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
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

  // Rollover needs every prior month's budget/spend for a category, not
  // just the one being viewed, so these are loaded unscoped and the month
  // filtering happens inside computeCategoryBudget.
  const budgets = useLiveQuery(
    () =>
      user
        ? db.budgets.where("user_id").equals(user.id).filter((b) => !b.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at && t.type === "expense")
            .toArray()
        : [],
    [user?.id],
  );

  const budgetInfoByCategory = useMemo(() => {
    const key = month.slice(0, 7);
    const map = new Map<string, ReturnType<typeof computeCategoryBudget>>();
    for (const category of categories ?? []) {
      map.set(category.id, computeCategoryBudget(category, key, budgets ?? [], transactions ?? []));
    }
    return map;
  }, [categories, budgets, transactions, month]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Budgets</h1>
        <p className="text-sm text-muted-foreground">{monthLabel(month)}</p>
      </div>

      <div className="space-y-3">
        {categories?.map((category) => {
          const info = budgetInfoByCategory.get(category.id);
          const spent = info?.spent ?? 0;
          const budgetAmount = info?.budgeted ?? 0;
          const available = info?.available ?? 0;
          const carryIn = info?.carryIn ?? 0;
          const pct = available > 0 ? Math.min(100, (spent / available) * 100) : 0;
          const over = available > 0 && spent > available;

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
                  {category.rollover && (
                    <Repeat className="size-3 text-emerald-600 dark:text-emerald-400" />
                  )}
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

              {category.rollover && carryIn !== 0 && (
                <div
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    carryIn > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  )}
                >
                  {carryIn > 0 ? (
                    <ArrowUpRight className="size-3.5" />
                  ) : (
                    <ArrowDownRight className="size-3.5" />
                  )}
                  {formatCurrency(Math.abs(carryIn), currency)}{" "}
                  {carryIn > 0 ? "rolled over from last month" : "carried over from overspending"}
                </div>
              )}

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full ${over ? "bg-destructive" : "bg-primary"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(spent, currency)} spent</span>
                {available > 0 && (
                  <span>
                    {formatCurrency(available, currency)}
                    {carryIn !== 0 ? " available" : " budget"}
                  </span>
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
