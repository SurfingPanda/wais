import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import { createTransaction } from "./transactions";
import type { Loan, LoanPaymentType } from "../types";

export interface LoanInput {
  name: string;
  principal: number;
  payment_type: LoanPaymentType;
  monthly_payment: number | null;
  category_id: string | null;
}

export async function createLoan(userId: string, input: LoanInput) {
  const now = new Date().toISOString();
  const loan: Loan = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: input.name,
    principal: input.principal,
    payment_type: input.payment_type,
    monthly_payment: input.payment_type === "recurring" ? input.monthly_payment : null,
    category_id: input.category_id,
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

  const patch = {
    ...input,
    monthly_payment: input.payment_type === "recurring" ? input.monthly_payment : null,
  };
  const updated: Loan = { ...existing, ...patch, updated_at: new Date().toISOString() };
  await db.loans.put(updated);
  await enqueueMutation({ table: "loans", op: "update", recordId: id, payload: { id, ...patch } });
  void runSync(userId);
  return updated;
}

// Soft-deletes the loan. Payments already recorded stay in the transaction
// history as ordinary expenses.
export async function deleteLoan(userId: string, id: string) {
  const existing = await db.loans.get(id);
  if (!existing) return;

  const deletedAt = new Date().toISOString();
  await db.loans.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({ table: "loans", op: "delete", recordId: id, payload: {} });
  void runSync(userId);
}

// Records a payment against a loan as an expense transaction, so it flows
// into the dashboard, category spending, and budgets like any other expense.
export async function recordLoanPayment(
  userId: string,
  loan: Loan,
  amount: number,
  occurredAt: string,
) {
  return createTransaction(userId, {
    amount,
    type: "expense",
    description: `${loan.name} payment`,
    category_id: loan.category_id,
    loan_id: loan.id,
    occurred_at: occurredAt,
  });
}
