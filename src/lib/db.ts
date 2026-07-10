import Dexie, { type EntityTable } from "dexie";
import type { Category, Transaction, Budget, Mutation, SyncMeta } from "./types";

const db = new Dexie("budgeting-app") as Dexie & {
  categories: EntityTable<Category, "id">;
  transactions: EntityTable<Transaction, "id">;
  budgets: EntityTable<Budget, "id">;
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

export default db;
