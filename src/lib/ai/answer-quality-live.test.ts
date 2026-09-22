import { describe, expect, it } from "vitest";
import { ANSWER_QUALITY_CASES } from "./answer-quality-cases";
import { evaluateAnswerQuality } from "./answer-quality";
import { completeOwlieChat } from "@/lib/groq";

const live = process.env.OWLIE_LIVE_EVAL === "1";

describe.skipIf(!live)("Owlie live answer-quality evaluation", () => {
  for (const testCase of ANSWER_QUALITY_CASES) {
    it(
      testCase.id,
      async () => {
        const answer = await completeOwlieChat(testCase.context, [
          { role: "user", content: testCase.question },
        ]);
        const result = evaluateAnswerQuality(testCase, answer);
        expect(result, `Answer failed quality checks:\n${answer}`).toEqual({
          passed: true,
          missingFacts: [],
          forbiddenClaims: [],
        });
      },
      30_000,
    );
  }
});
