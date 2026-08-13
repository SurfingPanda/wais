import type { SavingsGoal } from "@/lib/types";
import { formatCurrency } from "@/lib/format";
import type { CategoryBudgetHealth } from "@/lib/budget-health";
import type { GoalHealth } from "@/lib/goal-health";
import { generateOnDeviceText } from "./on-device";

export type InsightTone = "critical" | "warning" | "info";

export interface Insight {
  /** Stable key for caching/dedup, e.g. `budget:${categoryId}`. */
  id: string;
  tone: InsightTone;
  text: string;
  href?: string;
  source: "ai" | "fallback";
}

// --- Rule-based fallbacks — pure, synchronous, reuse already-computed numbers ---

export function fallbackBudgetInsight(
  categoryId: string,
  categoryName: string,
  h: CategoryBudgetHealth,
  currency: string,
): Insight | null {
  if (h.status === "critical") {
    const over = h.spent - h.available;
    return {
      id: `budget:${categoryId}`,
      tone: "critical",
      text: `Your ${categoryName} budget is over by ${formatCurrency(over, currency)} this month — try pulling back on ${categoryName} for the rest of the month.`,
      href: "/budgets",
      source: "fallback",
    };
  }
  if (h.paceOverBudget && h.projectedSpend !== null) {
    return {
      id: `budget:${categoryId}`,
      tone: "warning",
      text: `At this pace, ${categoryName} will land around ${formatCurrency(h.projectedSpend, currency)} — over your ${formatCurrency(h.available, currency)} budget. Slow down to stay on track.`,
      href: "/budgets",
      source: "fallback",
    };
  }
  if (h.status === "warning") {
    return {
      id: `budget:${categoryId}`,
      tone: "warning",
      text: `${categoryName} is at ${Math.round(h.pct)}% of its budget — keep an eye on it.`,
      href: "/budgets",
      source: "fallback",
    };
  }
  return null;
}

export function fallbackGoalInsight(goal: SavingsGoal, h: GoalHealth, currency: string): Insight | null {
  if (h.status !== "behind") return null;
  return {
    id: `goal:${goal.id}`,
    tone: "warning",
    text: `${goal.name} is falling behind schedule — you've saved ${Math.round(h.pct)}% so far. Add about ${formatCurrency(h.requiredDailyAmount ?? 0, currency)}/day to catch up.`,
    href: "/goals",
    source: "fallback",
  };
}

// --- Prompt builders — small, facts-only (this runs on-device, but keeping
// prompts tiny keeps generation latency low) ---

function buildBudgetPrompt(categoryName: string, h: CategoryBudgetHealth, currency: string): string {
  const facts = [
    `category: ${categoryName}`,
    `budgeted: ${formatCurrency(h.available, currency)}`,
    `spent: ${formatCurrency(h.spent, currency)} (${Math.round(h.pct)}%)`,
    h.projectedSpend !== null
      ? `projected month-end spend: ${formatCurrency(h.projectedSpend, currency)}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `Give one short, encouraging sentence of budgeting advice about this category: ${facts}. Suggest one concrete action.`;
}

function buildGoalPrompt(goal: SavingsGoal, h: GoalHealth, currency: string): string {
  const facts = [
    `goal: ${goal.name}`,
    `target: ${formatCurrency(h.target, currency)}`,
    `saved so far: ${formatCurrency(h.contributed, currency)} (${Math.round(h.pct)}%)`,
    h.daysRemaining !== null ? `days remaining: ${h.daysRemaining}` : null,
    h.requiredDailyAmount !== null
      ? `amount needed per day to catch up: ${formatCurrency(h.requiredDailyAmount, currency)}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `Give one short, encouraging sentence about this savings goal that's behind schedule: ${facts}. Suggest one concrete action.`;
}

// --- Orchestrators: try on-device generation, fall back to the template on
// null/error/unavailability. These are what use-owlie-insight.ts calls. ---

export async function generateBudgetInsight(
  categoryId: string,
  categoryName: string,
  h: CategoryBudgetHealth,
  currency: string,
): Promise<Insight | null> {
  const fallback = fallbackBudgetInsight(categoryId, categoryName, h, currency);
  if (!fallback) return null;
  const text = await generateOnDeviceText(buildBudgetPrompt(categoryName, h, currency));
  return text ? { ...fallback, text, source: "ai" } : fallback;
}

export async function generateGoalInsight(
  goal: SavingsGoal,
  h: GoalHealth,
  currency: string,
): Promise<Insight | null> {
  const fallback = fallbackGoalInsight(goal, h, currency);
  if (!fallback) return null;
  const text = await generateOnDeviceText(buildGoalPrompt(goal, h, currency));
  return text ? { ...fallback, text, source: "ai" } : fallback;
}
