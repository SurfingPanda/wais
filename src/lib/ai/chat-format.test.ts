import { describe, expect, it } from "vitest";
import { parseChatContent } from "./chat-format";

describe("parseChatContent", () => {
  it("parses Owlie's readable Markdown subset", () => {
    expect(
      parseChatContent(
        [
          "Your daily dinner budget is **₱201**.",
          "",
          "## Calculation",
          "₱1,005 ÷ 5 = ₱201 per day",
          "",
          "### Next steps",
          "- Set aside tomorrow's amount.",
          "- Keep a small buffer.",
          "",
          "1. Review after day two.",
          "2. Adjust if needed.",
        ].join("\n"),
      ),
    ).toEqual([
      { type: "paragraph", text: "Your daily dinner budget is **₱201**." },
      { type: "heading", text: "Calculation" },
      { type: "calculation", text: "₱1,005 ÷ 5 = ₱201 per day" },
      { type: "heading", text: "Next steps" },
      {
        type: "unordered-list",
        items: ["Set aside tomorrow's amount.", "Keep a small buffer."],
      },
      { type: "ordered-list", items: ["Review after day two.", "Adjust if needed."] },
    ]);
  });

  it("treats unrecognized Markdown as plain text instead of HTML", () => {
    expect(parseChatContent("<script>alert('no')</script>")).toEqual([
      { type: "paragraph", text: "<script>alert('no')</script>" },
    ]);
  });
});
