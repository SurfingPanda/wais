import { describe, expect, it } from "vitest";
import {
  buildTargetedTransactionContext,
  retrieveRelevantTransactions,
  type TransactionRetrievalData,
} from "./transaction-retrieval";
import type { Account, Category, Transaction } from "@/lib/types";

const timestamp = "2026-09-01T00:00:00.000Z";
const ownership = { user_id: "user-1", household_id: "household-1" };

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: "transaction-1",
    ...ownership,
    category_id: "category-grocery",
    account_id: "account-cash",
    amount: 100,
    type: "expense",
    description: "SM Supermarket",
    occurred_at: "2024-01-15",
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    ...overrides,
  };
}

const categories: Category[] = [
  {
    id: "category-grocery",
    ...ownership,
    name: "Groceries",
    color: "#10b981",
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  },
  {
    id: "category-dining",
    ...ownership,
    name: "Dining",
    color: "#f59e0b",
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  },
];

const accounts: Account[] = [
  {
    id: "account-cash",
    ...ownership,
    name: "Cash Wallet",
    type: "cash",
    starting_balance: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  },
  {
    id: "account-card",
    ...ownership,
    name: "Blue Card",
    type: "credit_card",
    starting_balance: 0,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  },
];

function data(): TransactionRetrievalData {
  return {
    accounts,
    categories,
    transactions: [
      transaction({ id: "old-sm", amount: 845.5, description: "SM Supermarket weekly shop" }),
      transaction({
        id: "old-dinner",
        category_id: "category-dining",
        account_id: "account-card",
        amount: 650,
        description: "Anniversary dinner",
        occurred_at: "2025-08-22",
      }),
      transaction({ id: "last-month", occurred_at: "2026-08-08", description: "Local market" }),
      transaction({ id: "recent", occurred_at: "2026-09-10", description: "Recent groceries" }),
      transaction({ id: "deleted", description: "Hidden purchase", deleted_at: timestamp }),
    ],
  };
}

describe("retrieveRelevantTransactions", () => {
  it("retrieves an old transaction by description and amount", () => {
    const matches = retrieveRelevantTransactions("Find my SM purchase for 845.50", data(), "2026-09-20");
    expect(matches.map((match) => match.transaction.id)).toEqual(["old-sm"]);
    expect(matches[0].reasons).toContain("amount");
  });

  it("combines category, account, and month filters", () => {
    const matches = retrieveRelevantTransactions(
      "What Dining expense used my Blue Card in August 2025?",
      data(),
      "2026-09-20",
    );
    expect(matches.map((match) => match.transaction.id)).toEqual(["old-dinner"]);
    expect(matches[0].reasons).toEqual(expect.arrayContaining(["month 2025-08", "category", "account"]));
  });

  it("understands relative month filters and excludes deleted rows", () => {
    const matches = retrieveRelevantTransactions("Show purchases from last month", data(), "2026-09-20");
    expect(matches.map((match) => match.transaction.id)).toEqual(["last-month"]);
    expect(matches.some((match) => match.transaction.id === "deleted")).toBe(false);
  });

  it("returns no matches when the question has no searchable transaction signal", () => {
    expect(retrieveRelevantTransactions("How am I doing?", data(), "2026-09-20")).toEqual([]);
  });

  it("formats matched records as bounded context for Owlie", () => {
    const context = buildTargetedTransactionContext(
      "Find my anniversary dinner",
      data(),
      "USD",
      "2026-09-20",
    );
    expect(context).toContain("Targeted historical transaction retrieval");
    expect(context).toContain("2025-08-22 | expense");
    expect(context).toContain("Anniversary dinner");
    expect(context).toContain("category Dining");
    expect(context).toContain("account Blue Card");
  });
});
