import { describe, it, expect } from "vitest";
import {
  computeRestockInfo,
  needsRestock,
  sortByUrgency,
  DEFAULT_RESTOCK_INTERVAL_DAYS,
} from "./grocery-restock";
import type { GroceryItem, GroceryPurchase } from "./types";

const item = (over: Partial<GroceryItem> = {}): GroceryItem => ({
  id: "i1",
  user_id: "u1",
  name: "Rice",
  restock_interval_days: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  deleted_at: null,
  ...over,
});

const purchase = (date: string, price = 100): GroceryPurchase => ({
  id: `p-${date}`,
  user_id: "u1",
  grocery_item_id: "i1",
  price,
  purchased_at: `${date}T00:00:00.000Z`,
  created_at: `${date}T00:00:00.000Z`,
  updated_at: `${date}T00:00:00.000Z`,
  deleted_at: null,
});

describe("computeRestockInfo", () => {
  it("reports no-history with no purchases", () => {
    const info = computeRestockInfo(item(), [], "2026-02-01");
    expect(info.status).toBe("no-history");
    expect(info.purchaseCount).toBe(0);
    expect(info.lastPurchasedAt).toBeNull();
    expect(info.daysUntilDue).toBeNull();
    expect(info.intervalDays).toBe(DEFAULT_RESTOCK_INTERVAL_DAYS);
  });

  it("uses the default interval with a single purchase", () => {
    const info = computeRestockInfo(item(), [purchase("2026-01-01")], "2026-01-05");
    expect(info.averageIntervalDays).toBeNull();
    expect(info.intervalDays).toBe(14);
    expect(info.nextExpectedAt).toBe("2026-01-15");
    expect(info.daysUntilDue).toBe(10);
    expect(info.status).toBe("ok");
  });

  it("learns the average interval from 2+ purchases", () => {
    const purchases = [purchase("2026-01-01"), purchase("2026-01-11")];
    const overdue = computeRestockInfo(item(), purchases, "2026-01-25");
    expect(overdue.averageIntervalDays).toBe(10);
    expect(overdue.intervalDays).toBe(10);
    expect(overdue.nextExpectedAt).toBe("2026-01-21");
    expect(overdue.daysUntilDue).toBe(-4);
    expect(overdue.status).toBe("overdue");

    const dueSoon = computeRestockInfo(item(), purchases, "2026-01-19");
    expect(dueSoon.daysUntilDue).toBe(2);
    expect(dueSoon.status).toBe("due-soon");
  });

  it("prefers a manual interval override over the learned average", () => {
    const purchases = [purchase("2026-01-01"), purchase("2026-01-31")]; // 30-day gap
    const info = computeRestockInfo(item({ restock_interval_days: 7 }), purchases, "2026-02-01");
    expect(info.intervalDays).toBe(7);
    expect(info.averageIntervalDays).toBe(30);
  });

  it("is order-independent and carries the latest price", () => {
    const info = computeRestockInfo(
      item(),
      [purchase("2026-01-11", 55), purchase("2026-01-01", 40)],
      "2026-01-12",
    );
    expect(info.lastPurchasedAt).toBe("2026-01-11");
    expect(info.lastPrice).toBe(55);
  });
});

describe("needsRestock", () => {
  it("is true only for overdue / due-soon", () => {
    const base = computeRestockInfo(item(), [purchase("2026-01-01"), purchase("2026-01-11")], "2026-01-25");
    expect(needsRestock({ ...base, status: "overdue" })).toBe(true);
    expect(needsRestock({ ...base, status: "due-soon" })).toBe(true);
    expect(needsRestock({ ...base, status: "ok" })).toBe(false);
    expect(needsRestock({ ...base, status: "no-history" })).toBe(false);
  });
});

describe("sortByUrgency", () => {
  it("orders by soonest due, no-history last", () => {
    const mk = (daysUntilDue: number | null) => ({
      info: { daysUntilDue } as ReturnType<typeof computeRestockInfo>,
    });
    const sorted = sortByUrgency([mk(2), mk(null), mk(-4)]);
    expect(sorted.map((s) => s.info.daysUntilDue)).toEqual([-4, 2, null]);
  });
});
