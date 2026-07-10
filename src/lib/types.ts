export type TransactionType = "income" | "expense";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string | null;
  // Set when this expense is a payment against a loan. Optional because
  // rows written before the loans feature exist without the key locally.
  loan_id?: string | null;
  // Which account this transaction affects. Optional for the same reason.
  account_id?: string | null;
  amount: number;
  type: TransactionType;
  description: string;
  occurred_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type AccountType = "cash" | "checking" | "savings" | "debit_card" | "credit_card" | "other";

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  // Balance before any tagged transactions; current balance = this +
  // income - expenses recorded against the account.
  starting_balance: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type LoanPaymentType = "recurring" | "one_time";

export interface Loan {
  id: string;
  user_id: string;
  name: string;
  principal: number;
  payment_type: LoanPaymentType;
  monthly_payment: number | null; // only for recurring loans
  // Day of month (1-31) a recurring payment is due; recomputed every cycle.
  due_day?: number | null;
  // Fixed calendar date a one-time payment is due.
  due_date?: string | null;
  category_id: string | null; // category applied to recorded payments
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string; // first-of-month date, e.g. "2026-07-01"
  amount: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type SyncTable = "categories" | "transactions" | "budgets" | "loans" | "accounts";
export type MutationOp = "insert" | "update" | "delete";

export interface Mutation {
  id?: number;
  table: SyncTable;
  op: MutationOp;
  recordId: string;
  payload: object;
  createdAt: string;
}

export interface SyncMeta {
  table: SyncTable;
  lastSyncedAt: string;
}
