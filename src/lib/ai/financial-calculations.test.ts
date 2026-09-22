import { describe, expect, it } from "vitest";
import {
  computeDailyAllowance,
  computeGroceryPriceChange,
  computeLoanPayoffEstimate,
  computeSavingsMonthlyRequirement,
  computeSpendingRunway,
} from "./financial-calculations";
import type { GroceryPurchase, Transaction } from "@/lib/types";

const ownership = { user_id: "user-1", household_id: "household-1" };
const timestamp = "2026-09-01T00:00:00.000Z";

function expense(id: string, amount: number, occurredAt: string): Transaction {
  return {
    id,
    ...ownership,
    category_id: null,
    account_id: "account-1",
    amount,
    type: "expense",
    description: id,
    occurred_at: occurredAt,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };
}

function purchase(id: string, price: number, purchasedAt: string): GroceryPurchase {
  return {
    id,
    ...ownership,
    grocery_item_id: "grocery-1",
    price,
    purchased_at: purchasedAt,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  };
}

describe("deterministic Owlie calculations", () => {
  it("calculates a daily budget from remaining funds and inclusive days", () => {
    expect(computeDailyAllowance(500, 280, "2026-09-20")).toEqual({
      remaining: 220,
      daysRemaining: 11,
      amountPerDay: 20,
    });
  });

  it("estimates fixed-payment loan payoff timing", () => {
    expect(computeLoanPayoffEstimate(1_050, 100, "2026-09-20")).toEqual({
      months: 11,
      projectedMonth: "2027-08",
    });
    expect(computeLoanPayoffEstimate(1_050, 0, "2026-09-20")).toBeNull();
  });

  it("calculates equal monthly savings needed by the target date", () => {
    expect(computeSavingsMonthlyRequirement(5_000, 500, "2027-06-20", "2026-09-20")).toEqual({
      remaining: 4_500,
      monthsRemaining: 9,
      amountPerMonth: 500,
    });
  });

  it("calculates trailing average spending and liquid-fund runway", () => {
    const result = computeSpendingRunway(
      [
        expense("june", 600, "2026-06-10"),
        expense("july", 900, "2026-07-10"),
        expense("august", 1_500, "2026-08-10"),
        expense("current", 9_999, "2026-09-10"),
      ],
      5_000,
      "2026-09-20",
    );
    expect(result.averageMonthlySpending).toBe(1_000);
    expect(result.runwayMonths).toBe(5);
  });

  it("calculates the latest grocery price change", () => {
    expect(
      computeGroceryPriceChange([
        purchase("old", 80, "2026-08-01"),
        purchase("new", 100, "2026-09-01"),
      ]),
    ).toEqual({
      previousPrice: 80,
      latestPrice: 100,
      amountChange: 20,
      percentChange: 25,
    });
  });
});
