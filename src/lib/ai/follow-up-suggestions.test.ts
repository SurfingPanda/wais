import { describe, expect, it } from "vitest";
import { getFollowUpSuggestions, type FollowUpContext } from "./follow-up-suggestions";

const fullContext: FollowUpContext = {
  question: "",
  hasAccounts: true,
  hasBudgets: true,
  hasGoals: true,
  hasGroceries: true,
  hasLoans: true,
  hasTransactions: true,
};

describe("getFollowUpSuggestions", () => {
  it("prioritizes prompts relevant to the latest question", () => {
    const suggestions = getFollowUpSuggestions({
      ...fullContext,
      question: "Can I afford my loan payment with my current cash balance?",
    });
    expect(suggestions[0]).toBe("Can I afford my upcoming loan payment?");
    expect(suggestions).toContain("Create a five-day spending plan");
    expect(suggestions).toHaveLength(4);
  });

  it("only suggests features that have supporting Wais data", () => {
    expect(
      getFollowUpSuggestions({
        question: "What should I look at next?",
        hasAccounts: false,
        hasBudgets: false,
        hasGoals: true,
        hasGroceries: false,
        hasLoans: false,
        hasTransactions: false,
      }),
    ).toEqual(["How much should I save toward my goals this month?"]);
  });

  it("does not repeat the question the user just asked", () => {
    const suggestions = getFollowUpSuggestions({
      ...fullContext,
      question: "Show my largest expenses this month",
    });
    expect(suggestions).not.toContain("Show my largest expenses this month");
  });
});
