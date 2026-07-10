import type { Loan } from "./types";

export const DUE_SOON_DAYS = 5;

export type LoanDueStatus = "overdue" | "due-soon" | "scheduled" | "due-this-month";

export interface LoanDueInfo {
  status: LoanDueStatus;
  // ISO yyyy-mm-dd for the computed due date, when a specific day is known.
  // Null for "due-this-month", where only the month (not a day) is set.
  date: string | null;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function toIsoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Computes how urgent a loan's next payment is, or null if there's nothing
// to remind about (already paid for this cycle, or no due date is known and
// the loan doesn't need one). `paidForCycle` means: paid this calendar month
// for recurring loans, or fully paid off for one-time loans.
export function getLoanDueInfo(
  loan: Loan,
  paidForCycle: boolean,
  now: Date = new Date(),
): LoanDueInfo | null {
  if (paidForCycle) return null;
  const today = startOfDay(now);

  if (loan.payment_type === "recurring") {
    if (!loan.due_day) return { status: "due-this-month", date: null };
    const dueDate = startOfDay(new Date(now.getFullYear(), now.getMonth(), loan.due_day));
    const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
    const date = toIsoDate(dueDate);
    if (diffDays < 0) return { status: "overdue", date };
    if (diffDays <= DUE_SOON_DAYS) return { status: "due-soon", date };
    return { status: "scheduled", date };
  }

  // one_time
  if (!loan.due_date) return null;
  const dueDate = startOfDay(new Date(`${loan.due_date}T00:00:00`));
  const diffDays = Math.round((dueDate.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return { status: "overdue", date: loan.due_date };
  if (diffDays <= DUE_SOON_DAYS) return { status: "due-soon", date: loan.due_date };
  return { status: "scheduled", date: loan.due_date };
}
