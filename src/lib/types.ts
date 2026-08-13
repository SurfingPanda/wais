export type TransactionType = "income" | "expense" | "transfer";

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  // Carries unused (or overspent) budget into the next month instead of
  // resetting each month. Optional because rows written before this field
  // existed don't have it locally.
  rollover?: boolean;
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
  // Set when this expense is a contribution toward a savings goal. Optional
  // because rows written before the goals feature exist without the key.
  goal_id?: string | null;
  // Which account this transaction affects. For transfers, the account
  // money moves out of. Optional because rows written before the accounts
  // feature exist without the key locally.
  account_id?: string | null;
  // Transfers only — the account money moves into. Never set for income/
  // expense rows.
  to_account_id?: string | null;
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

export interface SavingsGoal {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  // Optional deadline, informational only — no due-status/urgency system.
  target_date?: string | null;
  category_id: string | null; // category applied to recorded contributions
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

export type RecurringFrequency = "weekly" | "monthly";

export interface RecurringTransaction {
  id: string;
  user_id: string;
  category_id: string | null;
  account_id: string | null;
  amount: number;
  type: TransactionType;
  description: string;
  frequency: RecurringFrequency;
  day_of_month: number | null; // 1-31, monthly only
  weekday: number | null; // 0 (Sun) - 6 (Sat), weekly only
  start_date: string; // yyyy-mm-dd, first eligible occurrence
  end_date: string | null; // yyyy-mm-dd, stop generating after this date
  last_generated_date: string | null; // yyyy-mm-dd of the most recent occurrence turned into a transaction
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type SyncTable =
  | "categories"
  | "transactions"
  | "budgets"
  | "loans"
  | "accounts"
  | "recurring_transactions"
  | "savings_goals";
export type MutationOp = "insert" | "update" | "delete";

export interface Mutation {
  id?: number;
  table: SyncTable;
  op: MutationOp;
  recordId: string;
  payload: object;
  // The record's updated_at this mutation was based on (update/delete only).
  // Lets sync detect that someone else changed the record first, instead of
  // silently overwriting their edit.
  baseUpdatedAt?: string;
  createdAt: string;
}

export interface SyncMeta {
  table: SyncTable;
  lastSyncedAt: string;
}

export interface SyncConflict {
  id?: number;
  table: SyncTable;
  recordId: string;
  op: MutationOp;
  // What the local edit would have written, kept so the user can see what
  // they tried to change and manually redo it if they still want it.
  localPayload: object;
  detectedAt: string;
}
