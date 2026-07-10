import Dexie, { type EntityTable } from "dexie";
import type { Category, Transaction, Budget, Loan, Account, Mutation, SyncMeta } from "./types";

const db = new Dexie("budgeting-app") as Dexie & {
  categories: EntityTable<Category, "id">;
  transactions: EntityTable<Transaction, "id">;
  budgets: EntityTable<Budget, "id">;
  loans: EntityTable<Loan, "id">;
  accounts: EntityTable<Account, "id">;
  mutations: EntityTable<Mutation, "id">;
  syncMeta: EntityTable<SyncMeta, "table">;
};

db.version(1).stores({
  categories: "id, user_id, updated_at, deleted_at",
  transactions: "id, user_id, category_id, occurred_at, updated_at, deleted_at",
  budgets: "id, user_id, category_id, month, updated_at, deleted_at",
  mutations: "++id, table, createdAt",
  syncMeta: "table",
});

db.version(2).stores({
  loans: "id, user_id, updated_at, deleted_at",
  transactions: "id, user_id, category_id, loan_id, occurred_at, updated_at, deleted_at",
});

db.version(3).stores({
  accounts: "id, user_id, updated_at, deleted_at",
  transactions: "id, user_id, category_id, loan_id, account_id, occurred_at, updated_at, deleted_at",
});

export default db;
