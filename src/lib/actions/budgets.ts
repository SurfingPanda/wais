import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import type { Budget } from "../types";
import { assertNonNegativeAmount } from "./validation";

// Creates or updates the single budget row for a category+month, matching
// the (user_id, category_id, month) unique constraint on the server.
export async function setBudget(
  userId: string,
  categoryId: string,
  month: string,
  amount: number,
) {
  assertNonNegativeAmount(amount, "Budget amount");
  if (!/^\d{4}-\d{2}-01$/.test(month) || !Number.isFinite(Date.parse(`${month}T00:00:00Z`))) {
    throw new Error("Budget month is invalid.");
  }
  const existing = await db.budgets
    .where("category_id")
    .equals(categoryId)
    .filter((b) => b.user_id === userId && b.month === month && !b.deleted_at)
    .first();

  const now = new Date().toISOString();

  if (existing) {
    const updated: Budget = { ...existing, amount, updated_at: now };
    await db.budgets.put(updated);
    await enqueueMutation({
      table: "budgets",
      op: "update",
      recordId: existing.id,
      // Updates are sent as upserts by the offline sync layer. Keep the
      // complete row here so a locally-created budget that has not reached
      // Supabase yet never turns into an invalid partial insert.
      payload: updated,
      baseUpdatedAt: existing.updated_at,
    });
    void runSync(userId);
    return updated;
  }

  const budget: Budget = {
    id: crypto.randomUUID(),
    user_id: userId,
    category_id: categoryId,
    month,
    amount,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await db.budgets.put(budget);
  await enqueueMutation({ table: "budgets", op: "insert", recordId: budget.id, payload: budget });
  void runSync(userId);
  return budget;
}
