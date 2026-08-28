import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import { createTransaction } from "./transactions";
import { reconciliationAdjustment } from "../reconcile";
import type { Account, AccountType } from "../types";

export { reconciliationAdjustment };

export interface AccountInput {
  name: string;
  type: AccountType;
  starting_balance: number;
}

export async function createAccount(userId: string, input: AccountInput) {
  const now = new Date().toISOString();
  const account: Account = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: input.name,
    type: input.type,
    starting_balance: input.starting_balance,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.accounts.put(account);
  await enqueueMutation({ table: "accounts", op: "insert", recordId: account.id, payload: account });
  void runSync(userId);
  return account;
}

export async function updateAccount(userId: string, id: string, input: AccountInput) {
  const existing = await db.accounts.get(id);
  if (!existing) throw new Error("Account not found");

  const updated: Account = { ...existing, ...input, updated_at: new Date().toISOString() };
  await db.accounts.put(updated);
  await enqueueMutation({
    table: "accounts",
    op: "update",
    recordId: id,
    payload: { id, ...input },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

// Reconciliation. `currentBalance` is what Wais computes for the account;
// `statementBalance` is what it actually holds (per a bank statement or a
// count). Any gap between them is booked as a dated adjustment transaction
// tagged to the account, so the computed balance matches from then on and
// the correction stays visible in the ledger. Returns null when they already
// agree (to the cent).
export async function reconcileAccount(
  userId: string,
  accountId: string,
  currentBalance: number,
  statementBalance: number,
  occurredAt: string,
) {
  const adjustment = reconciliationAdjustment(currentBalance, statementBalance);
  if (!adjustment) return null;

  return createTransaction(userId, {
    amount: adjustment.amount,
    type: adjustment.type,
    description: "Balance adjustment",
    category_id: null,
    account_id: accountId,
    is_adjustment: true,
    occurred_at: occurredAt,
  });
}

// Soft-deletes the account. Transactions already tagged with it keep their
// account_id (same pattern as deleting a category).
export async function deleteAccount(userId: string, id: string) {
  const existing = await db.accounts.get(id);
  if (!existing) return;

  const deletedAt = new Date().toISOString();
  await db.accounts.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "accounts",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}
