import { describe, expect, it } from "vitest";
import { belongsToHousehold } from "./household";

describe("household row scoping", () => {
  it("keeps rows in the active household and excludes other households", () => {
    const row = { user_id: "owner", household_id: "home" };
    expect(belongsToHousehold(row, "member", "home")).toBe(true);
    expect(belongsToHousehold(row, "member", "other")).toBe(false);
  });

  it("falls back to legacy user-owned rows while household metadata is absent", () => {
    expect(belongsToHousehold({ user_id: "user" }, "user", "home")).toBe(true);
    expect(belongsToHousehold({ user_id: "other" }, "user", "home")).toBe(false);
  });
});
