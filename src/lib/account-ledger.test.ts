import { describe, expect, it } from "vitest";
import { accountBalance, accountTransactionDelta, accountTransactionLabel } from "./account-ledger";
import type { Account, Transaction } from "./types";

const checking: Account = {
  id: "checking",
  user_id: "user",
  name: "Checking",
  type: "checking",
  starting_balance: 1000,
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
  deleted_at: null,
};
const card: Account = { ...checking, id: "card", name: "Card", type: "credit_card" };

function transaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: crypto.randomUUID(),
    user_id: "user",
    category_id: null,
    amount: 100,
    type: "expense",
    description: "Test",
    occurred_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    ...overrides,
  };
}

describe("account ledger semantics", () => {
  it("treats credit-card expenses as debt and payments as debt reduction", () => {
    const charge = transaction({ account_id: "card" });
    const payment = transaction({
      type: "transfer",
      account_id: "checking",
      to_account_id: "card",
    });

    expect(accountTransactionDelta(card, charge)).toBe(100);
    expect(accountTransactionDelta(card, payment)).toBe(-100);
    expect(accountBalance(card, [charge, payment])).toBe(1000);
    expect(accountTransactionLabel(payment, new Map([[checking.id, checking], [card.id, card]]), card.id)).toBe(
      "Transfer from Checking",
    );
  });

  it("labels refunds and reconciliation adjustments for audit history", () => {
    const accounts = new Map([[checking.id, checking]]);
    expect(accountTransactionLabel(transaction({ type: "income", is_refund: true }), accounts)).toBe("Refund");
    expect(accountTransactionLabel(transaction({ is_adjustment: true }), accounts)).toBe(
      "Reconciliation adjustment",
    );
  });
});
