import type { SavingsGoal } from "./types";

export type GoalHealthStatus = "on-track" | "behind" | "reached" | "no-target-date";
export const GOAL_BEHIND_THRESHOLD_PCT = 10;

export interface GoalHealth {
  contributed: number;
  target: number;
  /** Clamped 0-100. */
  pct: number;
  reached: boolean;
  status: GoalHealthStatus;
  /** Signed days until target_date; negative once passed. Null without a target_date. */
  daysRemaining: number | null;
  /** Linear-schedule expected progress (0-100) between created_at and target_date. */
  expectedPct: number | null;
  /** expectedPct - pct; positive means behind schedule. */
  behindByPct: number | null;
  /** Daily amount needed to close the remaining gap by target_date. */
  requiredDailyAmount: number | null;
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function computeGoalHealth(goal: SavingsGoal, contributed: number, today: string): GoalHealth {
  const target = goal.target_amount;
  const pct = target > 0 ? Math.min(100, (contributed / target) * 100) : 0;
  const reached = contributed >= target;
  const remaining = Math.max(0, target - contributed);

  if (reached) {
    return {
      contributed,
      target,
      pct: 100,
      reached: true,
      status: "reached",
      daysRemaining: null,
      expectedPct: null,
      behindByPct: null,
      requiredDailyAmount: null,
    };
  }

  if (!goal.target_date) {
    return {
      contributed,
      target,
      pct,
      reached: false,
      status: "no-target-date",
      daysRemaining: null,
      expectedPct: null,
      behindByPct: null,
      requiredDailyAmount: null,
    };
  }

  const createdDate = goal.created_at.slice(0, 10);
  const daysRemaining = daysBetween(today, goal.target_date);
  // Guards bad/legacy data (target_date at or before created_at) by treating the goal as immediately due.
  const totalDays = Math.max(1, daysBetween(createdDate, goal.target_date));
  const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(createdDate, today)));
  const expectedPct = Math.min(100, (elapsedDays / totalDays) * 100);
  const behindByPct = expectedPct - pct;
  const overdue = daysRemaining < 0;
  const status: GoalHealthStatus =
    overdue || behindByPct > GOAL_BEHIND_THRESHOLD_PCT ? "behind" : "on-track";
  const requiredDailyAmount = daysRemaining > 0 ? remaining / daysRemaining : remaining;

  return { contributed, target, pct, reached: false, status, daysRemaining, expectedPct, behindByPct, requiredDailyAmount };
}

export function needsAttention(h: GoalHealth): boolean {
  return h.status === "behind";
}

/** Most behind-schedule item, or null if nothing needs attention. */
export function mostUrgentGoal<T extends { health: GoalHealth }>(items: T[]): T | null {
  const candidates = items.filter((item) => needsAttention(item.health));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, item) =>
    (item.health.behindByPct ?? 0) > (best.health.behindByPct ?? 0) ? item : best,
  );
}
