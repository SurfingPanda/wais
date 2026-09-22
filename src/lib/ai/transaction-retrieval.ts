import { addMonths, formatCurrency } from "@/lib/format";
import type { Account, Category, Transaction } from "@/lib/types";

const DEFAULT_LIMIT = 20;
const STOP_WORDS = new Set([
  "about",
  "account",
  "after",
  "amount",
  "before",
  "bought",
  "could",
  "expense",
  "from",
  "have",
  "last",
  "month",
  "older",
  "payment",
  "purchase",
  "show",
  "spent",
  "that",
  "this",
  "transaction",
  "what",
  "when",
  "where",
  "which",
  "with",
  "year",
]);

const MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

export interface TransactionRetrievalData {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
}

export interface TransactionMatch {
  transaction: Transaction;
  score: number;
  reasons: string[];
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function searchableTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .map(stem)
      .filter((token) => token.length >= 2 && !STOP_WORDS.has(token)),
  );
}

function previousMonth(today: string): string {
  return addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
}

function extractDateFilters(question: string, today: string) {
  const exactDates = new Set<string>();
  const months = new Set<string>();
  const years = new Set<string>();

  for (const match of question.matchAll(/\b(20\d{2})-(0[1-9]|1[0-2])(?:-([0-2]\d|3[01]))?\b/g)) {
    years.add(match[1]);
    months.add(`${match[1]}-${match[2]}`);
    if (match[3]) exactDates.add(`${match[1]}-${match[2]}-${match[3]}`);
  }

  const normalized = normalize(question);
  if (/\bthis month\b/.test(normalized)) months.add(today.slice(0, 7));
  if (/\blast month\b/.test(normalized)) months.add(previousMonth(today));
  if (/\bthis year\b/.test(normalized)) years.add(today.slice(0, 4));
  if (/\blast year\b/.test(normalized)) years.add(String(Number(today.slice(0, 4)) - 1));

  const explicitYear = [...normalized.matchAll(/\b(20\d{2})\b/g)].at(-1)?.[1] ?? today.slice(0, 4);
  for (const [name, number] of Object.entries(MONTHS)) {
    if (new RegExp(`\\b${name}\\b`).test(normalized)) months.add(`${explicitYear}-${number}`);
  }

  return { exactDates, months, years };
}

function matchingEntityIds<T extends { id: string; name: string }>(question: string, rows: T[]): Set<string> {
  const normalizedQuestion = normalize(question);
  const questionTokens = searchableTokens(question);
  const ids = new Set<string>();

  for (const row of rows) {
    const normalizedName = normalize(row.name);
    const nameTokens = searchableTokens(row.name);
    if (
      normalizedName &&
      (normalizedQuestion.includes(normalizedName) ||
        (nameTokens.size > 0 && [...nameTokens].every((token) => questionTokens.has(token))))
    ) {
      ids.add(row.id);
    }
  }
  return ids;
}

function extractAmounts(question: string): number[] {
  return [...question.matchAll(/(?:^|[^\d])((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?/g)]
    .map((match) => Number(`${match[1].replaceAll(",", "")}${match[2] ? `.${match[2]}` : ""}`))
    .filter((value) => Number.isFinite(value) && value > 0 && !(value >= 1900 && value <= 2100));
}

export function retrieveRelevantTransactions(
  question: string,
  data: TransactionRetrievalData,
  today: string,
  limit = DEFAULT_LIMIT,
): TransactionMatch[] {
  const questionTokens = searchableTokens(question);
  const dateFilters = extractDateFilters(question, today);
  const categoryIds = matchingEntityIds(question, data.categories.filter((row) => !row.deleted_at));
  const accountIds = matchingEntityIds(question, data.accounts.filter((row) => !row.deleted_at));
  const amounts = extractAmounts(question);
  const hasDateFilter =
    dateFilters.exactDates.size > 0 || dateFilters.months.size > 0 || dateFilters.years.size > 0;

  const matches: TransactionMatch[] = [];
  for (const transaction of data.transactions) {
    if (transaction.deleted_at) continue;
    const date = transaction.occurred_at.slice(0, 10);
    const month = date.slice(0, 7);
    const year = date.slice(0, 4);

    const exactDateMatch = dateFilters.exactDates.has(date);
    const monthMatch = dateFilters.exactDates.size === 0 && dateFilters.months.has(month);
    const yearMatch =
      dateFilters.exactDates.size === 0 &&
      dateFilters.months.size === 0 &&
      dateFilters.years.has(year);
    if (hasDateFilter && !exactDateMatch && !monthMatch && !yearMatch) continue;

    const categoryMatch = !!transaction.category_id && categoryIds.has(transaction.category_id);
    if (categoryIds.size > 0 && !categoryMatch) continue;

    const accountMatch =
      (!!transaction.account_id && accountIds.has(transaction.account_id)) ||
      (!!transaction.to_account_id && accountIds.has(transaction.to_account_id));
    if (accountIds.size > 0 && !accountMatch) continue;

    const descriptionTokens = searchableTokens(transaction.description);
    const matchingDescriptionTokens = [...questionTokens].filter((token) => descriptionTokens.has(token));
    const amountMatch = amounts.some((amount) => Math.abs(amount - transaction.amount) < 0.005);

    const reasons: string[] = [];
    let score = 0;
    if (exactDateMatch) {
      score += 20;
      reasons.push(`date ${date}`);
    } else if (monthMatch) {
      score += 12;
      reasons.push(`month ${month}`);
    } else if (yearMatch) {
      score += 6;
      reasons.push(`year ${year}`);
    }
    if (categoryMatch) {
      score += 10;
      reasons.push("category");
    }
    if (accountMatch) {
      score += 10;
      reasons.push("account");
    }
    if (matchingDescriptionTokens.length > 0) {
      score += Math.min(10, matchingDescriptionTokens.length * 2);
      reasons.push(`description: ${matchingDescriptionTokens.join(", ")}`);
    }
    if (amountMatch) {
      score += 8;
      reasons.push("amount");
    }

    if (score > 0) matches.push({ transaction, score, reasons });
  }

  return matches
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.transaction.occurred_at.localeCompare(a.transaction.occurred_at) ||
        b.transaction.created_at.localeCompare(a.transaction.created_at),
    )
    .slice(0, Math.max(1, limit));
}

function cleanText(value: string, maxLength = 100): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}…`;
}

export function buildTargetedTransactionContext(
  question: string,
  data: TransactionRetrievalData,
  currency: string,
  today: string,
): string | null {
  const matches = retrieveRelevantTransactions(question, data, today);
  if (matches.length === 0) return null;

  const categoriesById = new Map(data.categories.map((category) => [category.id, category.name]));
  const accountsById = new Map(data.accounts.map((account) => [account.id, account.name]));
  const lines = matches.map(({ transaction, reasons }) => {
    const category = transaction.category_id ? categoriesById.get(transaction.category_id) : null;
    const source = transaction.account_id ? accountsById.get(transaction.account_id) : null;
    const destination = transaction.to_account_id ? accountsById.get(transaction.to_account_id) : null;
    const account = transaction.type === "transfer"
      ? `${source ?? "unassigned"} to ${destination ?? "unassigned"}`
      : source ?? "unassigned";
    return `- ${transaction.occurred_at.slice(0, 10)} | ${transaction.type} | ${formatCurrency(transaction.amount, currency)} | ${cleanText(transaction.description || "Untitled")} | category ${cleanText(category ?? "uncategorized")} | account ${cleanText(account)} | matched by ${reasons.join(", ")}`;
  });

  return [
    `Targeted historical transaction retrieval for the user's latest questions (${matches.length} match(es), household-scoped):`,
    ...lines,
    "Use these exact records when answering the historical question. If they do not resolve the request, say that no matching Wais transaction was retrieved and ask for a more specific date, account, category, description, or amount.",
  ].join("\n");
}
