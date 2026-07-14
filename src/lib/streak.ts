import { addDays, daysInMonth } from "./date";
import type { Budget, Transaction } from "./types";

export interface BudgetStreak {
  current: number;
  best: number;
  todayStatus: "under" | "over" | "no-budget";
}

// A day counts as "on budget" when total spend that day is within the
// month's total budget prorated evenly across its days. Months with no
// budget set at all can't be evaluated, so they neither extend nor count
// against a streak.
export function computeBudgetStreak(
  transactions: Transaction[],
  budgets: Budget[],
  today: string,
): BudgetStreak {
  const budgetTotalByMonth = new Map<string, number>();
  for (const b of budgets) {
    if (b.deleted_at) continue;
    const key = b.month.slice(0, 7);
    budgetTotalByMonth.set(key, (budgetTotalByMonth.get(key) ?? 0) + b.amount);
  }

  const spentByDay = new Map<string, number>();
  for (const t of transactions) {
    if (t.deleted_at || t.type !== "expense") continue;
    const day = t.occurred_at.slice(0, 10);
    spentByDay.set(day, (spentByDay.get(day) ?? 0) + t.amount);
  }

  function dayOnBudget(day: string): boolean | null {
    const monthBudget = budgetTotalByMonth.get(day.slice(0, 7));
    if (!monthBudget) return null;
    const allowance = monthBudget / daysInMonth(day.slice(0, 7));
    return (spentByDay.get(day) ?? 0) <= allowance;
  }

  let current = 0;
  for (let day = addDays(today, -1); dayOnBudget(day) === true; day = addDays(day, -1)) {
    current++;
  }

  const firstBudgetMonth = [...budgetTotalByMonth.keys()].sort()[0];
  let best = 0;
  if (firstBudgetMonth) {
    let run = 0;
    const yesterday = addDays(today, -1);
    for (let day = `${firstBudgetMonth}-01`; day <= yesterday; day = addDays(day, 1)) {
      run = dayOnBudget(day) === true ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }

  const todayOnBudget = dayOnBudget(today);
  const todayStatus = todayOnBudget === null ? "no-budget" : todayOnBudget ? "under" : "over";

  return { current, best, todayStatus };
}
