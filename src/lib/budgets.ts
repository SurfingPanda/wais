import type { Budget, Category, Transaction } from "./types";

export interface CategoryBudgetInfo {
  categoryId: string;
  /** Amount explicitly set as this category's budget for the month. */
  budgeted: number;
  /** Leftover carried in from prior months — negative when overspent. Always 0 unless the category has rollover enabled. */
  carryIn: number;
  /** budgeted + carryIn — what's actually available to spend this month. */
  available: number;
  spent: number;
  /** available - spent — negative once over budget. */
  remaining: number;
}

// Rollover is opt-in per category and applies retroactively across every
// month on record: each month's leftover (budgeted + carried-in - spent)
// feeds into the next, so a category that's been under budget for a while
// accumulates a growing cushion, and one that's been overspending arrives
// at the current month already behind.
export function computeCategoryBudget(
  category: Pick<Category, "id" | "rollover">,
  month: string, // "YYYY-MM"
  budgets: Budget[],
  transactions: Transaction[],
): CategoryBudgetInfo {
  const budgetByMonth = new Map<string, number>();
  for (const b of budgets) {
    if (b.deleted_at || b.category_id !== category.id) continue;
    const key = b.month.slice(0, 7);
    budgetByMonth.set(key, (budgetByMonth.get(key) ?? 0) + b.amount);
  }

  const spentByMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.deleted_at || t.type !== "expense" || t.category_id !== category.id) continue;
    const key = t.occurred_at.slice(0, 7);
    spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + t.amount);
  }

  const budgeted = budgetByMonth.get(month) ?? 0;
  const spent = spentByMonth.get(month) ?? 0;

  let carryIn = 0;
  if (category.rollover) {
    const priorMonths = [...new Set([...budgetByMonth.keys(), ...spentByMonth.keys()])]
      .filter((m) => m < month)
      .sort();
    let carry = 0;
    for (const m of priorMonths) {
      const available = (budgetByMonth.get(m) ?? 0) + carry;
      carry = available - (spentByMonth.get(m) ?? 0);
    }
    carryIn = carry;
  }

  const available = budgeted + carryIn;
  return { categoryId: category.id, budgeted, carryIn, available, spent, remaining: available - spent };
}
