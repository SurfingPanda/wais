import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import { createTransaction } from "./transactions";
import { getDueOccurrences } from "../recurrence";
import type { RecurringFrequency, RecurringTransaction, TransactionType } from "../types";

export interface RecurringInput {
  description: string;
  amount: number;
  type: TransactionType;
  category_id: string | null;
  account_id: string | null;
  frequency: RecurringFrequency;
  day_of_month: number | null; // monthly only
  weekday: number | null; // weekly only
  start_date: string;
  end_date: string | null;
  reminder_days_before: number | null;
}

// day_of_month/weekday only apply to their matching frequency — clear the
// other so switching frequency doesn't leave a stale value behind.
function normalizeRecurringInput(input: RecurringInput) {
  return {
    ...input,
    day_of_month: input.frequency === "monthly" ? input.day_of_month : null,
    weekday: input.frequency === "weekly" ? input.weekday : null,
  };
}

export async function createRecurringTransaction(userId: string, input: RecurringInput) {
  const now = new Date().toISOString();
  const rule: RecurringTransaction = {
    id: crypto.randomUUID(),
    user_id: userId,
    ...normalizeRecurringInput(input),
    last_generated_date: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.recurring_transactions.put(rule);
  await enqueueMutation({
    table: "recurring_transactions",
    op: "insert",
    recordId: rule.id,
    payload: rule,
  });
  void runSync(userId);
  return rule;
}

export async function updateRecurringTransaction(userId: string, id: string, input: RecurringInput) {
  const existing = await db.recurring_transactions.get(id);
  if (!existing) throw new Error("Recurring transaction not found");

  const patch = normalizeRecurringInput(input);
  const updated: RecurringTransaction = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await db.recurring_transactions.put(updated);
  await enqueueMutation({
    table: "recurring_transactions",
    op: "update",
    recordId: id,
    payload: { id, ...patch },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

// Soft-deletes the rule. Transactions it already generated stay in the
// transaction history as ordinary entries.
export async function deleteRecurringTransaction(userId: string, id: string) {
  const existing = await db.recurring_transactions.get(id);
  if (!existing) return;

  const deletedAt = new Date().toISOString();
  await db.recurring_transactions.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "recurring_transactions",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}

// Materializes every occurrence that's come due since each rule's last
// generation, as ordinary transactions. Purely local (Dexie only), so it
// works offline — safe to call as often as needed since a rule that's
// already caught up produces nothing.
export async function generateDueTransactions(userId: string, today: string) {
  const rules = await db.recurring_transactions
    .where("user_id")
    .equals(userId)
    .filter((r) => !r.deleted_at)
    .toArray();

  for (const rule of rules) {
    const due = getDueOccurrences(rule, today);
    if (due.length === 0) continue;

    for (const occurredAt of due) {
      await createTransaction(userId, {
        amount: rule.amount,
        type: rule.type,
        description: rule.description,
        category_id: rule.category_id,
        account_id: rule.account_id,
        occurred_at: new Date(`${occurredAt}T00:00:00Z`).toISOString(),
      });
    }

    const lastGeneratedDate = due[due.length - 1];
    await db.recurring_transactions.put({
      ...rule,
      last_generated_date: lastGeneratedDate,
      updated_at: new Date().toISOString(),
    });
    await enqueueMutation({
      table: "recurring_transactions",
      op: "update",
      recordId: rule.id,
      payload: { id: rule.id, last_generated_date: lastGeneratedDate },
      baseUpdatedAt: rule.updated_at,
    });
  }
}
