import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import type { Transaction, TransactionType } from "../types";

export interface TransactionInput {
  amount: number;
  type: TransactionType;
  description: string;
  category_id: string | null;
  loan_id?: string | null;
  goal_id?: string | null;
  account_id?: string | null;
  to_account_id?: string | null;
  occurred_at: string;
}

export async function createTransaction(userId: string, input: TransactionInput) {
  const now = new Date().toISOString();
  const transaction: Transaction = {
    id: crypto.randomUUID(),
    user_id: userId,
    category_id: input.category_id,
    loan_id: input.loan_id ?? null,
    goal_id: input.goal_id ?? null,
    account_id: input.account_id ?? null,
    to_account_id: input.to_account_id ?? null,
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

  const updated: Transaction = { ...existing, ...input, updated_at: new Date().toISOString() };
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
