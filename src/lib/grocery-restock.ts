import { addDays } from "./date";
import type { GroceryItem, GroceryPurchase } from "./types";

export type RestockStatus = "overdue" | "due-soon" | "ok" | "no-history";

export const DEFAULT_RESTOCK_INTERVAL_DAYS = 14;
// Flagged as "due soon" this many days before the next expected purchase.
const DUE_SOON_WINDOW_DAYS = 3;

export interface RestockInfo {
  lastPurchasedAt: string | null; // yyyy-mm-dd
  lastPrice: number | null;
  purchaseCount: number;
  /** Average days between purchases, once there are 2+ to learn from. */
  averageIntervalDays: number | null;
  /** Interval actually used: manual override > learned average > default. */
  intervalDays: number;
  nextExpectedAt: string | null; // yyyy-mm-dd
  /** Negative once overdue. Null with no purchase history yet. */
  daysUntilDue: number | null;
  status: RestockStatus;
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const [ty, tm, td] = toDate.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** `purchases` should be this item's own non-deleted grocery_purchases rows, any order. */
export function computeRestockInfo(
  item: GroceryItem,
  purchases: GroceryPurchase[],
  today: string,
): RestockInfo {
  const sorted = [...purchases].sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));

  if (sorted.length === 0) {
    return {
      lastPurchasedAt: null,
      lastPrice: null,
      purchaseCount: 0,
      averageIntervalDays: null,
      intervalDays: item.restock_interval_days ?? DEFAULT_RESTOCK_INTERVAL_DAYS,
      nextExpectedAt: null,
      daysUntilDue: null,
      status: "no-history",
    };
  }

  const last = sorted[sorted.length - 1];
  const lastDate = last.purchased_at.slice(0, 10);

  let averageIntervalDays: number | null = null;
  if (sorted.length >= 2) {
    let totalGapDays = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalGapDays += daysBetween(
        sorted[i - 1].purchased_at.slice(0, 10),
        sorted[i].purchased_at.slice(0, 10),
      );
    }
    averageIntervalDays = Math.max(1, Math.round(totalGapDays / (sorted.length - 1)));
  }

  const intervalDays =
    item.restock_interval_days ?? averageIntervalDays ?? DEFAULT_RESTOCK_INTERVAL_DAYS;
  const nextExpectedAt = addDays(lastDate, intervalDays);
  const daysUntilDue = daysBetween(today, nextExpectedAt);
  const status: RestockStatus =
    daysUntilDue <= 0 ? "overdue" : daysUntilDue <= DUE_SOON_WINDOW_DAYS ? "due-soon" : "ok";

  return {
    lastPurchasedAt: lastDate,
    lastPrice: last.price,
    purchaseCount: sorted.length,
    averageIntervalDays,
    intervalDays,
    nextExpectedAt,
    daysUntilDue,
    status,
  };
}

export function needsRestock(info: RestockInfo): boolean {
  return info.status === "overdue" || info.status === "due-soon";
}

/** Most overdue (or soonest due) first; items with no history sort last. */
export function sortByUrgency<T extends { info: RestockInfo }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ad = a.info.daysUntilDue ?? Infinity;
    const bd = b.info.daysUntilDue ?? Infinity;
    return ad - bd;
  });
}
