import { describe, it, expect } from "vitest";
import { getNextOccurrence, getDueOccurrences, type RecurrenceRule } from "./recurrence";

const weekly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "weekly",
  day_of_month: null,
  weekday: 1, // Monday
  start_date: "2026-01-01", // a Thursday
  end_date: null,
  last_generated_date: null,
  ...over,
});

const monthly = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "monthly",
  day_of_month: 15,
  weekday: null,
  start_date: "2026-01-01",
  end_date: null,
  last_generated_date: null,
  ...over,
});

describe("getNextOccurrence — weekly", () => {
  it("finds the first matching weekday on or after the start", () => {
    expect(getNextOccurrence(weekly())).toBe("2026-01-05");
  });

  it("advances past the last generated date", () => {
    expect(getNextOccurrence(weekly({ last_generated_date: "2026-01-05" }))).toBe("2026-01-12");
  });

  it("returns null once the next occurrence would fall after end_date", () => {
    expect(
      getNextOccurrence(weekly({ last_generated_date: "2026-01-05", end_date: "2026-01-10" })),
    ).toBeNull();
  });
});

describe("getNextOccurrence — monthly", () => {
  it("uses day_of_month in the start month when it hasn't passed", () => {
    expect(getNextOccurrence(monthly({ day_of_month: 15 }))).toBe("2026-01-15");
  });

  it("clamps day_of_month to the length of the month", () => {
    expect(
      getNextOccurrence(monthly({ day_of_month: 31, last_generated_date: "2026-01-31" })),
    ).toBe("2026-02-28");
  });

  it("rolls to next month when this month's day has already been generated", () => {
    expect(
      getNextOccurrence(monthly({ day_of_month: 1, last_generated_date: "2026-01-01" })),
    ).toBe("2026-02-01");
  });
});

describe("getDueOccurrences", () => {
  it("lists every past-due weekly date, oldest first", () => {
    expect(getDueOccurrences(weekly(), "2026-01-20")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
    ]);
  });

  it("lists every past-due monthly date", () => {
    expect(getDueOccurrences(monthly({ day_of_month: 1 }), "2026-03-15")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  it("stops at a past end_date", () => {
    expect(
      getDueOccurrences(monthly({ day_of_month: 1, end_date: "2026-02-10" }), "2026-05-01"),
    ).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("returns nothing when everything up to today is already generated", () => {
    expect(getDueOccurrences(weekly({ last_generated_date: "2026-05-01" }), "2026-05-01")).toEqual(
      [],
    );
  });

  it("respects the maxOccurrences cap", () => {
    expect(getDueOccurrences(weekly(), "2030-01-01", 5)).toHaveLength(5);
  });
});
