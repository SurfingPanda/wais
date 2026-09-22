export interface FollowUpContext {
  question: string;
  hasAccounts: boolean;
  hasBudgets: boolean;
  hasGoals: boolean;
  hasGroceries: boolean;
  hasLoans: boolean;
  hasTransactions: boolean;
}

interface Candidate {
  prompt: string;
  enabled: boolean;
  keywords: string[];
  domainKeywords?: string[];
}

const MAX_SUGGESTIONS = 4;

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getFollowUpSuggestions(context: FollowUpContext): string[] {
  const normalizedQuestion = normalize(context.question);
  const candidates: Candidate[] = [
    {
      prompt: "Create a five-day spending plan",
      enabled: context.hasAccounts || context.hasBudgets,
      keywords: ["afford", "balance", "cash", "daily", "plan", "spend"],
    },
    {
      prompt: "Which budget can I reduce?",
      enabled: context.hasBudgets,
      keywords: ["budget", "cut", "overspend", "reduce", "save"],
      domainKeywords: ["budget", "overspend"],
    },
    {
      prompt: "Show my largest expenses this month",
      enabled: context.hasTransactions,
      keywords: ["expense", "largest", "purchase", "spent", "transaction"],
    },
    {
      prompt: "Can I afford my upcoming loan payment?",
      enabled: context.hasLoans && context.hasAccounts,
      keywords: ["afford", "debt", "due", "loan", "payment"],
      domainKeywords: ["debt", "loan"],
    },
    {
      prompt: "How much should I save toward my goals this month?",
      enabled: context.hasGoals,
      keywords: ["goal", "save", "saving", "target"],
      domainKeywords: ["goal", "target"],
    },
    {
      prompt: "Which grocery prices have increased?",
      enabled: context.hasGroceries,
      keywords: ["grocery", "price", "restock", "shopping"],
      domainKeywords: ["grocery", "restock"],
    },
    {
      prompt: "How long will my available cash last?",
      enabled: context.hasAccounts && context.hasTransactions,
      keywords: ["balance", "cash", "last", "runway", "spend"],
    },
  ];

  return candidates
    .map((candidate, index) => ({
      ...candidate,
      index,
      score: candidate.keywords.reduce(
        (score, keyword) => score + (normalizedQuestion.includes(keyword) ? 1 : 0),
        0,
      ) +
        (candidate.domainKeywords ?? []).reduce(
          (score, keyword) => score + (normalizedQuestion.includes(keyword) ? 2 : 0),
          0,
        ),
    }))
    .filter(
      (candidate) =>
        candidate.enabled && normalize(candidate.prompt) !== normalizedQuestion,
    )
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, MAX_SUGGESTIONS)
    .map((candidate) => candidate.prompt);
}
