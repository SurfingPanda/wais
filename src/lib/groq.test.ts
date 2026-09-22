import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeOwlieChat, GroqChatError, type GroqChatErrorCode } from "./groq";

function response(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
  } as Response;
}

async function codeOf(promise: Promise<unknown>): Promise<GroqChatErrorCode | "NOT_GROQ_ERROR"> {
  try {
    await promise;
    throw new Error("expected request to reject");
  } catch (error) {
    return error instanceof GroqChatError ? error.code : "NOT_GROQ_ERROR";
  }
}

describe("completeOwlieChat", () => {
  beforeEach(() => {
    process.env.GROQ_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GROQ_API_KEY;
    delete process.env.GROQ_MODEL;
  });

  it("does not make a request when the API key is missing", async () => {
    delete process.env.GROQ_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(await codeOf(completeOwlieChat("snapshot", [{ role: "user", content: "Help" }]))).toBe(
      "not_configured",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the financial context and conversation to Groq", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, { choices: [{ message: { content: "  Keep your grocery spending steady.  " } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      completeOwlieChat("Groceries: 50% used", [{ role: "user", content: "How am I doing?" }]),
    ).resolves.toBe("Keep your grocery spending steady.");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    const body = JSON.parse(String(init.body)) as {
      model: string;
      max_completion_tokens: number;
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe("openai/gpt-oss-120b");
    expect(body.max_completion_tokens).toBe(1_000);
    expect(body.messages[0].content).toContain("Groceries: 50% used");
    expect(body.messages[0].content).toContain("directly in the first sentence");
    expect(body.messages[0].content).toContain("show the calculation");
    expect(body.messages[0].content).toContain("Wais-calculated metrics");
    expect(body.messages[0].content).toContain("explicitly repeat that assumption");
    expect(body.messages[0].content).toContain("targeted historical transaction section");
    expect(body.messages[0].content).toContain("Financial safety rules are mandatory");
    expect(body.messages[0].content).toContain("Never present an estimate");
    expect(body.messages[0].content).toContain("investment, tax, accounting, insurance, or legal claims");
    expect(body.messages[0].content).toContain("Prioritize essential expenses and minimum required debt payments");
    expect(body.messages[0].content).toContain("could cause an overdraft");
    expect(body.messages[0].content).toContain("Never invent, infer, or assume a missing balance");
    expect(body.messages[0].content).toContain("specific Wais figures used");
    expect(body.messages[0].content).toContain("label any estimate or assumption");
    expect(body.messages[0].content).toContain("one or two practical next steps");
    expect(body.messages[0].content).toContain("clarifying question instead of guessing");
    expect(body.messages[0].content).toContain("Use lightweight Markdown");
    expect(body.messages[0].content).toContain("do not use tables, code fences, HTML");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "How am I doing?" });
  });

  it.each([
    [429, "rate_limited"],
    [401, "not_configured"],
    [403, "not_configured"],
    [404, "not_configured"],
    [500, "provider_error"],
  ] as const)("maps HTTP %s to %s", async (status, code) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(status, "provider detail")));
    expect(await codeOf(completeOwlieChat("snapshot", [{ role: "user", content: "Help" }]))).toBe(code);
  });

  it("rejects an empty completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(200, { choices: [] })));
    expect(await codeOf(completeOwlieChat("snapshot", [{ role: "user", content: "Help" }]))).toBe(
      "bad_response",
    );
  });
});
