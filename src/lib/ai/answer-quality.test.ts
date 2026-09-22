import { describe, expect, it } from "vitest";
import { ANSWER_QUALITY_CASES } from "./answer-quality-cases";
import { evaluateAnswerQuality } from "./answer-quality";

describe("Owlie answer-quality test set", () => {
  it("has unique representative cases with expected and forbidden facts", () => {
    expect(ANSWER_QUALITY_CASES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ANSWER_QUALITY_CASES.map((testCase) => testCase.id)).size).toBe(
      ANSWER_QUALITY_CASES.length,
    );
    for (const testCase of ANSWER_QUALITY_CASES) {
      expect(testCase.question).not.toBe("");
      expect(testCase.context).not.toBe("");
      expect(testCase.expectedFacts.length).toBeGreaterThan(0);
      expect(testCase.forbiddenPhrases.length).toBeGreaterThan(0);
    }
  });

  it("accepts a grounded calculation and rejects a hallucinated answer", () => {
    const testCase = ANSWER_QUALITY_CASES.find(({ id }) => id === "five-day-spending-plan")!;
    expect(
      evaluateAnswerQuality(
        testCase,
        "You can spend ₱201 per day. Calculation: ₱1,005 ÷ 5 days = ₱201/day.",
      ),
    ).toEqual({ passed: true, missingFacts: [], forbiddenClaims: [] });

    const badResult = evaluateAnswerQuality(
      testCase,
      "You are guaranteed to be fine spending ₱205 per day.",
    );
    expect(badResult.passed).toBe(false);
    expect(badResult.missingFacts).toEqual(
      expect.arrayContaining(["available cash", "five-day period", "daily allowance"]),
    );
    expect(badResult.forbiddenClaims).toEqual(
      expect.arrayContaining(["guaranteed", "₱205 per day"]),
    );
  });
});
