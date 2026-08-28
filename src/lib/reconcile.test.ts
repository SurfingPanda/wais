import { describe, it, expect } from "vitest";
import { reconciliationAdjustment } from "./reconcile";

describe("reconciliationAdjustment", () => {
  it("returns null when the balances already agree", () => {
    expect(reconciliationAdjustment(100, 100)).toBeNull();
    expect(reconciliationAdjustment(-40.5, -40.5)).toBeNull();
    // Sub-cent drift rounds away to nothing.
    expect(reconciliationAdjustment(100, 100.004)).toBeNull();
  });

  it("books income when the statement is higher", () => {
    expect(reconciliationAdjustment(100, 150)).toEqual({ diff: 50, type: "income", amount: 50 });
  });

  it("books an expense when the statement is lower", () => {
    expect(reconciliationAdjustment(150, 100)).toEqual({ diff: -50, type: "expense", amount: 50 });
  });

  it("rounds the gap to cents", () => {
    const adj = reconciliationAdjustment(0, 12.345);
    expect(adj).toEqual({ diff: 12.35, type: "income", amount: 12.35 });
  });

  it("handles crossing zero", () => {
    expect(reconciliationAdjustment(-20, 30)).toEqual({ diff: 50, type: "income", amount: 50 });
    expect(reconciliationAdjustment(20, -30)).toEqual({ diff: -50, type: "expense", amount: 50 });
  });
});
