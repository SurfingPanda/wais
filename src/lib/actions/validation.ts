import db from "../db";
import type { Account } from "../types";

export function assertPositiveAmount(value: number, field = "Amount") {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be greater than zero.`);
  }
}

export function assertNonNegativeAmount(value: number, field = "Amount") {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be zero or greater.`);
  }
}

export function assertValidDate(value: string, field = "Date") {
  if (typeof value !== "string" || !value.trim() || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${field} is invalid.`);
  }
  const plainDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (plainDate) {
    const [, year, month, day] = plainDate;
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    if (
      parsed.getUTCFullYear() !== Number(year) ||
      parsed.getUTCMonth() !== Number(month) - 1 ||
      parsed.getUTCDate() !== Number(day)
    ) {
      throw new Error(`${field} is invalid.`);
    }
  }
}

export async function validateAccountReference(userId: string, accountId: string | null | undefined) {
  if (!accountId) return null;
  const account = await db.accounts.get(accountId);
  if (!account || account.deleted_at) {
    throw new Error("The selected account is not available in this household.");
  }

  const householdId = (account as Account & { household_id?: string | null }).household_id;
  if (householdId) {
    const membership = await db.household_members.get([householdId, userId]);
    if (!membership) throw new Error("The selected account is not available in this household.");
  } else if (account.user_id !== userId) {
    throw new Error("The selected account is not available in this household.");
  }
  return account;
}

export function assertValidTransactionType(type: string) {
  if (type !== "income" && type !== "expense" && type !== "transfer") {
    throw new Error("Transaction type is invalid.");
  }
}
