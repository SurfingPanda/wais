import { describe, it, expect } from "vitest";
import {
  formatCurrency,
  formatPercent,
  addMonths,
  currentMonth,
  todayLocalDate,
} from "./format";

// Strip everything but digits and a decimal separator so assertions don't
// depend on the runtime's default locale (grouping / symbol placement).
const digits = (s: string) => s.replace(/[^\d]/g, "");

describe("formatCurrency", () => {
  it("formats a normal amount with 2 decimals", () => {
    expect(digits(formatCurrency(1234.5, "USD"))).toBe("123450");
  });

  it("does not throw on an invalid currency code, and keeps the amount", () => {
    expect(() => formatCurrency(10, "")).not.toThrow();
    expect(() => formatCurrency(10, "not-a-code")).not.toThrow();
    const out = formatCurrency(10, "not-a-code");
    expect(out).toContain("not-a-code");
    expect(digits(out)).toBe("1000");
  });

  it("coerces a non-finite amount to 0 instead of printing NaN", () => {
    expect(formatCurrency(Number.NaN, "USD")).not.toMatch(/nan/i);
    expect(digits(formatCurrency(Number.NaN, "USD"))).toBe("000");
    expect(digits(formatCurrency(Number.POSITIVE_INFINITY, "USD"))).toBe("000");
  });
});

describe("formatPercent", () => {
  it("respects the digits argument and sign", () => {
    expect(formatPercent(12.345, 1)).toBe("12.3%");
    expect(formatPercent(-5, 0)).toBe("-5%");
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("addMonths", () => {
  it("returns the first of the shifted month", () => {
    expect(addMonths("2026-01-01", 1)).toBe("2026-02-01");
    expect(addMonths("2026-12-01", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-01", -1)).toBe("2025-12-01");
    expect(addMonths("2026-06-01", 0)).toBe("2026-06-01");
  });
});

describe("currentMonth / todayLocalDate", () => {
  it("currentMonth is a first-of-month key", () => {
    expect(currentMonth()).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("todayLocalDate is a YYYY-MM-DD string", () => {
    expect(todayLocalDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
