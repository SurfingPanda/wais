import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { extractReceipt, ScanReceiptError, type ScanErrorCode } from "./gemini";

// Minimal stand-in for the fetch Response fields extractReceipt reads.
function errorResponse(status: number, body = "") {
  return { ok: false, status, text: async () => body } as unknown as Response;
}
function okResponse(payload: unknown) {
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}
const geminiText = (obj: unknown) =>
  okResponse({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });

async function codeOf(promise: Promise<unknown>): Promise<ScanErrorCode | "NOT_A_SCAN_ERROR"> {
  try {
    await promise;
    throw new Error("expected extractReceipt to reject");
  } catch (err) {
    return err instanceof ScanReceiptError ? err.code : "NOT_A_SCAN_ERROR";
  }
}

describe("extractReceipt error mapping", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("not_configured when the API key is missing (no request made)", async () => {
    delete process.env.GEMINI_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await codeOf(extractReceipt("x", "image/jpeg"))).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Gemini HTTP statuses to codes", async () => {
    const cases: [number, ScanErrorCode][] = [
      [429, "rate_limited"],
      [401, "not_configured"],
      [403, "not_configured"],
      [404, "not_configured"],
      [400, "unreadable"],
      [500, "provider_error"],
      [503, "provider_error"],
    ];
    for (const [status, code] of cases) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(status, "boom")));
      expect(await codeOf(extractReceipt("x", "image/jpeg"))).toBe(code);
    }
  });

  it("image_rejected on a safety block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse({ promptFeedback: { blockReason: "SAFETY" } })));
    expect(await codeOf(extractReceipt("x", "image/jpeg"))).toBe("image_rejected");
  });

  it("image_rejected when the candidate finishReason is SAFETY", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ candidates: [{ finishReason: "SAFETY", content: { parts: [] } }] })),
    );
    expect(await codeOf(extractReceipt("x", "image/jpeg"))).toBe("image_rejected");
  });

  it("unreadable on an empty model response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: "  " }] } }] })),
    );
    expect(await codeOf(extractReceipt("x", "image/jpeg"))).toBe("unreadable");
  });

  it("bad_response when the model reply isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(okResponse({ candidates: [{ content: { parts: [{ text: "sorry, no" }] } }] })),
    );
    expect(await codeOf(extractReceipt("x", "image/jpeg"))).toBe("bad_response");
  });

  it("carries a status and a server-only detail, keeps detail out of message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(errorResponse(429, "RESOURCE_EXHAUSTED quota")));
    try {
      await extractReceipt("x", "image/jpeg");
      throw new Error("unreachable");
    } catch (err) {
      expect(err).toBeInstanceOf(ScanReceiptError);
      const e = err as ScanReceiptError;
      expect(e.status).toBe(429);
      expect(e.detail).toContain("RESOURCE_EXHAUSTED");
      expect(e.message).not.toContain("RESOURCE_EXHAUSTED");
    }
  });
});

describe("extractReceipt success", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("normalizes the model JSON into a ScannedReceipt", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        geminiText({
          merchant: "  SM Supermarket ",
          purchased_at: "2026-02-01",
          currency: "php",
          lines: [
            { name: " Milk ", price: 2.5 },
            { name: "", price: 9 }, // dropped: no name
            { name: "Eggs", price: -1 }, // dropped: negative price
            { name: "Bread", price: "3.499" }, // coerced + rounded
          ],
        }),
      ),
    );

    const receipt = await extractReceipt("x", "image/jpeg");
    expect(receipt.merchant).toBe("SM Supermarket");
    expect(receipt.purchasedAt).toBe("2026-02-01");
    expect(receipt.currency).toBe("PHP");
    expect(receipt.lines).toEqual([
      { name: "Milk", price: 2.5 },
      { name: "Bread", price: 3.5 },
    ]);
  });
});
