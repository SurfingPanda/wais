import { describe, it, expect } from "vitest";
import { addDays, daysInMonth, weekdayOf } from "./date";

describe("addDays", () => {
  it("crosses month boundaries", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("handles leap days", () => {
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("crosses year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("is a no-op for delta 0", () => {
    expect(addDays("2026-06-15", 0)).toBe("2026-06-15");
  });

  it("does not depend on the local timezone", () => {
    // Parsing "YYYY-MM-DD" as local time and re-serializing as UTC drifts a
    // day in any timezone ahead of UTC — this must stay exact regardless.
    expect(addDays("2026-06-15", 30)).toBe("2026-07-15");
  });
});

describe("daysInMonth", () => {
  it("returns the correct length per month", () => {
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });
});

describe("weekdayOf", () => {
  it("returns 0=Sunday .. 6=Saturday", () => {
    expect(weekdayOf("2026-01-01")).toBe(4); // Thursday
    expect(weekdayOf("2026-01-04")).toBe(0); // Sunday
    expect(weekdayOf("2026-01-03")).toBe(6); // Saturday
  });
});
