import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import { createTransaction } from "./transactions";
import type { SavingsGoal } from "../types";
import { assertPositiveAmount, assertValidDate, assertHouseholdAccess } from "./validation";
import { getActiveHouseholdId } from "../household";

export interface GoalInput {
  name: string;
  target_amount: number;
  target_date: string | null;
  category_id: string | null;
}

export async function createGoal(userId: string, input: GoalInput) {
  if (!input.name.trim()) throw new Error("Goal name is required.");
  assertPositiveAmount(input.target_amount, "Goal target");
  if (input.target_date) assertValidDate(input.target_date, "Target date");
  const now = new Date().toISOString();
  const household_id = await getActiveHouseholdId(userId);
  const goal: SavingsGoal = {
    id: crypto.randomUUID(),
    user_id: userId,
    household_id,
    ...input,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.savings_goals.put(goal);
  await enqueueMutation({ table: "savings_goals", op: "insert", recordId: goal.id, payload: goal });
  void runSync(userId);
  return goal;
}

export async function updateGoal(userId: string, id: string, input: GoalInput) {
  const existing = await db.savings_goals.get(id);
  if (!existing) throw new Error("Goal not found");
  await assertHouseholdAccess(userId, existing, "Goal not found");
  if (!input.name.trim()) throw new Error("Goal name is required.");
  assertPositiveAmount(input.target_amount, "Goal target");
  if (input.target_date) assertValidDate(input.target_date, "Target date");

  const updated: SavingsGoal = { ...existing, ...input, updated_at: new Date().toISOString() };
  await db.savings_goals.put(updated);
  await enqueueMutation({
    table: "savings_goals",
    op: "update",
    recordId: id,
    payload: { id, ...input },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

// Soft-deletes the goal. Contributions already recorded stay in the
// transaction history as ordinary expenses.
export async function deleteGoal(userId: string, id: string) {
  const existing = await db.savings_goals.get(id);
  if (!existing) return;
  await assertHouseholdAccess(userId, existing, "Goal not found");

  const deletedAt = new Date().toISOString();
  await db.savings_goals.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "savings_goals",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}

// Records a contribution toward a goal as an expense transaction, so it
// flows into the dashboard, category spending, and budgets like any other
// expense.
export async function recordGoalContribution(
  userId: string,
  goal: SavingsGoal,
  amount: number,
  occurredAt: string,
) {
  assertPositiveAmount(amount, "Contribution");
  assertValidDate(occurredAt, "Contribution date");
  await assertHouseholdAccess(userId, goal, "Goal not found");
  const contributed = await db.transactions
    .filter((transaction) => !transaction.deleted_at && transaction.goal_id === goal.id)
    .toArray();
  const remaining = goal.target_amount - contributed.reduce((sum, transaction) => sum + transaction.amount, 0);
  if (amount > Math.max(0, remaining)) {
    throw new Error("Contribution cannot be greater than the remaining goal amount.");
  }
  return createTransaction(userId, {
    amount,
    type: "expense",
    description: `${goal.name} contribution`,
    category_id: goal.category_id,
    goal_id: goal.id,
    occurred_at: occurredAt,
  });
}
