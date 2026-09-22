export type ChatContentBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "calculation"; text: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] };

const HEADING = /^#{1,3}\s+(.+)$/;
const UNORDERED_ITEM = /^\s*[-*]\s+(.+)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.+)$/;
const CALCULATION = /^.{1,100}\s(?:=|≈)\s.+$/;

/** Parses the small, safe Markdown subset Owlie is instructed to use. */
export function parseChatContent(text: string): ChatContentBlock[] {
  const blocks: ChatContentBlock[] = [];
  const paragraphLines: string[] = [];
  let list: Extract<ChatContentBlock, { type: "unordered-list" | "ordered-list" }> | null = null;

  function flushParagraph() {
    if (paragraphLines.length === 0) return;
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
    paragraphLines.length = 0;
  }

  function flushList() {
    if (!list) return;
    blocks.push(list);
    list = null;
  }

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", text: heading[1].trim() });
      continue;
    }

    const unordered = line.match(UNORDERED_ITEM);
    if (unordered) {
      flushParagraph();
      if (list?.type !== "unordered-list") {
        flushList();
        list = { type: "unordered-list", items: [] };
      }
      list.items.push(unordered[1].trim());
      continue;
    }

    const ordered = line.match(ORDERED_ITEM);
    if (ordered) {
      flushParagraph();
      if (list?.type !== "ordered-list") {
        flushList();
        list = { type: "ordered-list", items: [] };
      }
      list.items.push(ordered[1].trim());
      continue;
    }

    flushList();
    if (CALCULATION.test(line)) {
      flushParagraph();
      blocks.push({ type: "calculation", text: line });
    } else {
      paragraphLines.push(line);
    }
  }

  flushParagraph();
  flushList();
  return blocks;
}
