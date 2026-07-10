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
  amount: number;
  type: TransactionType;
  description: string;
  occurred_at: string;
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

export type SyncTable = "categories" | "transactions" | "budgets";
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
