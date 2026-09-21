import { describe, expect, it } from "vitest";
import { assertNonNegativeAmount, assertPositiveAmount, assertValidDate } from "./validation";

describe("financial action validation", () => {
  it("rejects non-positive amounts", () => {
    expect(() => assertPositiveAmount(0)).toThrow();
    expect(() => assertPositiveAmount(-1)).toThrow();
    expect(() => assertPositiveAmount(Number.NaN)).toThrow();
    expect(() => assertPositiveAmount(1)).not.toThrow();
  });

  it("allows zero only for non-negative fields", () => {
    expect(() => assertNonNegativeAmount(0)).not.toThrow();
    expect(() => assertNonNegativeAmount(-1)).toThrow();
  });

  it("rejects invalid dates", () => {
    expect(() => assertValidDate("not-a-date")).toThrow();
    expect(() => assertValidDate("2026-09-21")).not.toThrow();
  });
});
