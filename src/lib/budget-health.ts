import { daysInMonth } from "./date";
import { addMonths } from "./format";
import { computeCategoryBudget, type CategoryBudgetInfo } from "./budgets";
import type { Budget, Category, Transaction } from "./types";

export type BudgetHealthStatus = "good" | "warning" | "critical";
export const BUDGET_WARNING_PCT = 80;
export const BUDGET_CRITICAL_PCT = 100;

export interface CategoryBudgetHealth extends CategoryBudgetInfo {
  /** Clamped 0-100, for progress bars. 100 when spending happened against a zero/negative budget. */
  pct: number;
  status: BudgetHealthStatus;
  /** Projected month-end spend at the current daily pace. Only set when `month` is the current month. */
  projectedSpend: number | null;
  /** Pace is on track to exceed the budget by month end, even though it isn't over yet. */
  paceOverBudget: boolean;
}

export function computeCategoryBudgetHealth(
  category: Pick<Category, "id" | "rollover">,
  month: string, // "YYYY-MM"
  budgets: Budget[],
  transactions: Transaction[],
  today: string, // "YYYY-MM-DD"
): CategoryBudgetHealth {
  const info = computeCategoryBudget(category, month, budgets, transactions);

  const pct =
    info.available > 0
      ? Math.min(100, (info.spent / info.available) * 100)
      : info.spent > 0
        ? 100
        : 0;
  const status: BudgetHealthStatus =
    pct >= BUDGET_CRITICAL_PCT ? "critical" : pct >= BUDGET_WARNING_PCT ? "warning" : "good";

  const isCurrentMonth = today.slice(0, 7) === month;
  const elapsedDays = isCurrentMonth ? Math.max(1, Number(today.slice(8, 10))) : 0;
  const projectedSpend =
    isCurrentMonth && info.available > 0 ? (info.spent / elapsedDays) * daysInMonth(month) : null;
  const paceOverBudget =
    status === "good" && projectedSpend !== null && projectedSpend > info.available;

  return { ...info, pct, status, projectedSpend, paceOverBudget };
}

export function needsAttention(h: CategoryBudgetHealth): boolean {
  return h.status !== "good" || h.paceOverBudget;
}

function urgencyRank(h: CategoryBudgetHealth): number {
  if (h.status === "critical") return 3;
  if (h.paceOverBudget) return 2;
  if (h.status === "warning") return 1;
  return 0;
}

/** Most urgent item among those that `needsAttention`, or null if everything's fine. */
export function mostUrgentCategory<T extends CategoryBudgetHealth>(items: T[]): T | null {
  const candidates = items.filter(needsAttention);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) => {
    const rank = urgencyRank(item);
    const bestRank = urgencyRank(best);
    if (rank !== bestRank) return rank > bestRank ? item : best;
    return item.pct > best.pct ? item : best;
  });
}

export const BUDGET_FORECAST_MONTHS_BACK = 3;

export interface CategoryBudgetForecast {
  avgMonthlySpend: number;
  likelyOverrun: boolean;
}

// Projects whether a category is likely to exceed budget next month, from
// its trailing spend history. `available` is this month's available amount
// (budgeted + carry-in) — used as the best estimate of next month's budget,
// since a budget row for next month usually doesn't exist yet.
export function projectNextMonthOverrun(
  categoryId: string,
  month: string, // "YYYY-MM", current month
  transactions: Transaction[],
  available: number,
  monthsBack = BUDGET_FORECAST_MONTHS_BACK,
): CategoryBudgetForecast {
  const spentByMonth = new Map<string, number>();
  for (const t of transactions) {
    if (t.deleted_at || t.type !== "expense" || t.category_id !== categoryId) continue;
    const key = t.occurred_at.slice(0, 7);
    spentByMonth.set(key, (spentByMonth.get(key) ?? 0) + t.amount);
  }

  const trailingSpends: number[] = [];
  for (let i = 1; i <= monthsBack; i++) {
    const key = addMonths(`${month}-01`, -i).slice(0, 7);
    const spent = spentByMonth.get(key);
    if (spent !== undefined) trailingSpends.push(spent);
  }

  if (trailingSpends.length === 0) return { avgMonthlySpend: 0, likelyOverrun: false };

  const avgMonthlySpend = trailingSpends.reduce((sum, s) => sum + s, 0) / trailingSpends.length;
  const likelyOverrun = avgMonthlySpend > 0 && available > 0 && avgMonthlySpend > available;

  return { avgMonthlySpend, likelyOverrun };
}
