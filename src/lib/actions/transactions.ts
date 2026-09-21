import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import type { Transaction, TransactionType } from "../types";
import {
  assertPositiveAmount,
  assertValidDate,
  assertValidTransactionType,
  assertHouseholdAccess,
  validateAccountReference,
} from "./validation";
import { getActiveHouseholdId } from "../household";

export interface TransactionInput {
  // Optional explicit id. Pass a deterministic one (see generateDueTransactions)
  // when the same logical row might be created by more than one concurrent
  // run, so the second run upserts instead of inserting a duplicate.
  id?: string;
  amount: number;
  type: TransactionType;
  description: string;
  category_id: string | null;
  loan_id?: string | null;
  goal_id?: string | null;
  grocery_item_id?: string | null;
  account_id?: string | null;
  to_account_id?: string | null;
  // Set only by account reconciliation (see reconcileAccount).
  is_adjustment?: boolean;
  is_refund?: boolean;
  occurred_at: string;
}

export async function createTransaction(userId: string, input: TransactionInput) {
  assertPositiveAmount(input.amount);
  assertValidDate(input.occurred_at, "Transaction date");
  assertValidTransactionType(input.type);
  if (input.is_refund && input.type !== "income") {
    throw new Error("Refunds must be income transactions.");
  }
  const fromAccount = await validateAccountReference(userId, input.account_id);
  const toAccount = await validateAccountReference(userId, input.to_account_id);
  if (input.type === "transfer" && (!fromAccount || !toAccount || fromAccount.id === toAccount.id)) {
    throw new Error("Transfers require two different available accounts.");
  }
  if (input.type !== "transfer" && input.to_account_id) {
    throw new Error("Only transfers can have a destination account.");
  }
  const now = new Date().toISOString();
  const household_id = await getActiveHouseholdId(userId);
  const transaction: Transaction = {
    id: input.id ?? crypto.randomUUID(),
    user_id: userId,
    household_id,
    category_id: input.category_id,
    loan_id: input.loan_id ?? null,
    goal_id: input.goal_id ?? null,
    grocery_item_id: input.grocery_item_id ?? null,
    account_id: input.account_id ?? null,
    to_account_id: input.to_account_id ?? null,
    // Included only when set, so ordinary transactions' sync payloads don't
    // reference the column before its migration has been applied.
    ...(input.is_adjustment ? { is_adjustment: true } : {}),
    ...(input.is_refund ? { is_refund: true } : {}),
    amount: input.amount,
    type: input.type,
    description: input.description,
    occurred_at: input.occurred_at,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.transactions.put(transaction);
  await enqueueMutation({
    table: "transactions",
    op: "insert",
    recordId: transaction.id,
    payload: transaction,
  });
  void runSync(userId);
  return transaction;
}

export async function updateTransaction(userId: string, id: string, input: TransactionInput) {
  const existing = await db.transactions.get(id);
  if (!existing) throw new Error("Transaction not found");
  await assertHouseholdAccess(userId, existing, "Transaction not found");
  assertPositiveAmount(input.amount);
  assertValidDate(input.occurred_at, "Transaction date");
  assertValidTransactionType(input.type);
  if (input.is_refund && input.type !== "income") {
    throw new Error("Refunds must be income transactions.");
  }
  const fromAccount = await validateAccountReference(userId, input.account_id);
  const toAccount = await validateAccountReference(userId, input.to_account_id);
  if (input.type === "transfer" && (!fromAccount || !toAccount || fromAccount.id === toAccount.id)) {
    throw new Error("Transfers require two different available accounts.");
  }
  if (input.type !== "transfer" && input.to_account_id) {
    throw new Error("Only transfers can have a destination account.");
  }

  const inputWithoutId = { ...input };
  delete inputWithoutId.id;
  const updated: Transaction = { ...existing, ...inputWithoutId, id: existing.id, updated_at: new Date().toISOString() };
  await db.transactions.put(updated);
  await enqueueMutation({
    table: "transactions",
    op: "update",
    recordId: id,
    payload: { id, ...input },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

export async function deleteTransaction(userId: string, id: string) {
  const existing = await db.transactions.get(id);
  if (!existing) return;
  await assertHouseholdAccess(userId, existing, "Transaction not found");

  const deletedAt = new Date().toISOString();
  await db.transactions.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "transactions",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}
