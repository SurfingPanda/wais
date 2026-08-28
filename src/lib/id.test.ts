import { describe, it, expect } from "vitest";
import { deterministicUuid } from "./id";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("deterministicUuid", () => {
  it("produces a well-formed v5 UUID", async () => {
    expect(await deterministicUuid("recurring:abc:2026-01-01")).toMatch(UUID_RE);
  });

  it("is stable for the same key", async () => {
    const key = "recurring:rule-1:2026-02-15";
    expect(await deterministicUuid(key)).toBe(await deterministicUuid(key));
  });

  it("differs for different keys", async () => {
    const a = await deterministicUuid("recurring:rule-1:2026-02-15");
    const b = await deterministicUuid("recurring:rule-1:2026-03-15");
    const c = await deterministicUuid("recurring:rule-2:2026-02-15");
    expect(new Set([a, b, c]).size).toBe(3);
  });
});
