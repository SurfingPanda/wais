import { formatCurrency, currentMonth, monthLabel } from "@/lib/format";
import { computeCategoryBudgetHealth, type CategoryBudgetHealth } from "@/lib/budget-health";
import { computeGoalHealth } from "@/lib/goal-health";
import type { Budget, Category, SavingsGoal, Transaction } from "@/lib/types";

// Capped deliberately — this text becomes part of the model's system prompt,
// and a smaller prompt means faster on-device generation.
const MAX_CATEGORIES = 10;
const MAX_GOALS = 6;

export interface GoalContribution {
  goal: SavingsGoal;
  contributed: number;
}

/** Compact, natural-language snapshot of the user's current-month finances for the chat model's context. */
export function buildFinancialContext(
  categories: Category[],
  budgets: Budget[],
  transactions: Transaction[],
  goals: GoalContribution[],
  currency: string,
  today: string,
): string {
  const month = currentMonth();
  const key = month.slice(0, 7);

  let income = 0;
  let expense = 0;
  for (const t of transactions) {
    if (t.deleted_at || t.type === "transfer") continue;
    if (t.occurred_at.slice(0, 7) !== key) continue;
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }

  const budgetedThisMonth = new Set(
    budgets.filter((b) => !b.deleted_at && b.month.slice(0, 7) === key).map((b) => b.category_id),
  );
  const rolloverCategoryIds = new Set(categories.filter((c) => c.rollover).map((c) => c.id));
  const relevantCategoryIds = new Set([...budgetedThisMonth, ...rolloverCategoryIds]);

  const categoryLines = categories
    .filter((c) => relevantCategoryIds.has(c.id))
    .map((c) => ({ name: c.name, health: computeCategoryBudgetHealth(c, key, budgets, transactions, today) }))
    .filter((c): c is { name: string; health: CategoryBudgetHealth } => !(c.health.available <= 0 && c.health.spent === 0))
    .sort((a, b) => b.health.pct - a.health.pct)
    .slice(0, MAX_CATEGORIES)
    .map(
      ({ name, health }) =>
        `- ${name}: ${formatCurrency(health.spent, currency)} spent of ${formatCurrency(health.available, currency)} budgeted (${Math.round(health.pct)}%, ${health.status})`,
    );

  const goalLines = goals
    .slice(0, MAX_GOALS)
    .map(({ goal, contributed }) => ({ goal, health: computeGoalHealth(goal, contributed, today) }))
    .map(
      ({ goal, health }) =>
        `- ${goal.name}: ${formatCurrency(health.contributed, currency)} saved of ${formatCurrency(health.target, currency)} target (${Math.round(health.pct)}%, ${health.status})` +
        (goal.target_date ? `, target date ${goal.target_date}` : ""),
    );

  return [
    `Current month: ${monthLabel(month)}.`,
    `Income so far: ${formatCurrency(income, currency)}. Expenses so far: ${formatCurrency(expense, currency)}. Balance: ${formatCurrency(income - expense, currency)}.`,
    categoryLines.length > 0 ? `Budgets:\n${categoryLines.join("\n")}` : "No budgets set this month.",
    goalLines.length > 0 ? `Savings goals:\n${goalLines.join("\n")}` : "No savings goals set.",
  ].join("\n\n");
}
