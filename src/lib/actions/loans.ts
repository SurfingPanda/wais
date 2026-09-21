import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import { createTransaction } from "./transactions";
import type { Loan, LoanPaymentType } from "../types";
import { assertPositiveAmount, assertValidDate, assertHouseholdAccess, validateAccountReference } from "./validation";
import { getActiveHouseholdId } from "../household";

export interface LoanInput {
  name: string;
  principal: number;
  payment_type: LoanPaymentType;
  monthly_payment: number | null;
  due_day: number | null; // recurring loans only
  due_date: string | null; // one-time loans only
  category_id: string | null;
  reminder_days_before: number | null;
  account_id: string | null;
}

// Due-day/date only applies to its matching payment type — clear the other
// so switching plans doesn't leave a stale value behind.
function normalizeLoanInput(input: LoanInput) {
  return {
    ...input,
    monthly_payment: input.payment_type === "recurring" ? input.monthly_payment : null,
    due_day: input.payment_type === "recurring" ? input.due_day : null,
    due_date: input.payment_type === "one_time" ? input.due_date : null,
  };
}

function validateLoanInput(input: LoanInput) {
  if (!input.name.trim()) throw new Error("Loan name is required.");
  assertPositiveAmount(input.principal, "Loan principal");
  if (input.payment_type === "recurring") {
    if (input.monthly_payment == null) throw new Error("Monthly payment is required.");
    assertPositiveAmount(input.monthly_payment, "Monthly payment");
    if (input.due_day != null && (!Number.isInteger(input.due_day) || input.due_day < 1 || input.due_day > 31)) {
      throw new Error("Due day must be between 1 and 31.");
    }
  } else if (input.due_date) {
    assertValidDate(input.due_date, "Due date");
  }
  if (input.reminder_days_before != null && (!Number.isInteger(input.reminder_days_before) || input.reminder_days_before < 0 || input.reminder_days_before > 30)) {
    throw new Error("Reminder days must be between 0 and 30.");
  }
}

export async function createLoan(userId: string, input: LoanInput) {
  validateLoanInput(input);
  await validateAccountReference(userId, input.account_id);
  const now = new Date().toISOString();
  const household_id = await getActiveHouseholdId(userId);
  const loan: Loan = {
    id: crypto.randomUUID(),
    user_id: userId,
    household_id,
    ...normalizeLoanInput(input),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.loans.put(loan);
  await enqueueMutation({ table: "loans", op: "insert", recordId: loan.id, payload: loan });
  void runSync(userId);
  return loan;
}

export async function updateLoan(userId: string, id: string, input: LoanInput) {
  const existing = await db.loans.get(id);
  if (!existing) throw new Error("Loan not found");
  await assertHouseholdAccess(userId, existing, "Loan not found");
  validateLoanInput(input);
  await validateAccountReference(userId, input.account_id);

  const patch = normalizeLoanInput(input);
  const updated: Loan = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await db.loans.put(updated);
  await enqueueMutation({
    table: "loans",
    op: "update",
    recordId: id,
    payload: { id, ...patch },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

// Soft-deletes the loan. Payments already recorded stay in the transaction
// history as ordinary expenses.
export async function deleteLoan(userId: string, id: string) {
  const existing = await db.loans.get(id);
  if (!existing) return;
  await assertHouseholdAccess(userId, existing, "Loan not found");

  const deletedAt = new Date().toISOString();
  await db.loans.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "loans",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}

// Records a payment against a loan as an expense transaction, so it flows
// into the dashboard, category spending, and budgets like any other expense.
export async function recordLoanPayment(
  userId: string,
  loan: Loan,
  amount: number,
  occurredAt: string,
  accountId: string | null = null,
) {
  const storedLoan = await db.loans.get(loan.id);
  if (!storedLoan || storedLoan.deleted_at) {
    throw new Error("Loan not found");
  }
  await assertHouseholdAccess(userId, storedLoan, "Loan not found");
  assertPositiveAmount(amount, "Loan payment");
  assertValidDate(occurredAt, "Payment date");
  const paid = await db.transactions
    .filter((transaction) => !transaction.deleted_at && transaction.loan_id === loan.id)
    .toArray();
  const remaining = loan.principal - paid.reduce((sum, transaction) => sum + transaction.amount, 0);
  if (amount > Math.max(0, remaining)) {
    throw new Error("Payment cannot be greater than the remaining loan balance.");
  }
  await validateAccountReference(userId, accountId);
  return createTransaction(userId, {
    amount,
    type: "expense",
    description: `${loan.name} payment`,
    category_id: loan.category_id,
    loan_id: loan.id,
    account_id: accountId,
    occurred_at: occurredAt,
  });
}
