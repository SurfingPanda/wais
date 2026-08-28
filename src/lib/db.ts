import Dexie, { type EntityTable, type Table } from "dexie";
import type {
  Category,
  Transaction,
  Budget,
  Loan,
  Account,
  RecurringTransaction,
  SavingsGoal,
  GroceryItem,
  GroceryPurchase,
  Household,
  HouseholdMember,
  Mutation,
  SyncMeta,
  SyncConflict,
} from "./types";

const db = new Dexie("budgeting-app") as Dexie & {
  categories: EntityTable<Category, "id">;
  transactions: EntityTable<Transaction, "id">;
  budgets: EntityTable<Budget, "id">;
  loans: EntityTable<Loan, "id">;
  accounts: EntityTable<Account, "id">;
  recurring_transactions: EntityTable<RecurringTransaction, "id">;
  savings_goals: EntityTable<SavingsGoal, "id">;
  grocery_items: EntityTable<GroceryItem, "id">;
  grocery_purchases: EntityTable<GroceryPurchase, "id">;
  households: EntityTable<Household, "id">;
  household_members: Table<HouseholdMember, [string, string]>;
  mutations: EntityTable<Mutation, "id">;
  syncMeta: EntityTable<SyncMeta, "table">;
  conflicts: EntityTable<SyncConflict, "id">;
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

db.version(4).stores({
  recurring_transactions: "id, user_id, updated_at, deleted_at",
});

db.version(5).stores({
  conflicts: "++id, table, detectedAt",
});

db.version(6).stores({
  savings_goals: "id, user_id, updated_at, deleted_at",
  transactions:
    "id, user_id, category_id, loan_id, account_id, goal_id, occurred_at, updated_at, deleted_at",
});

db.version(7).stores({
  grocery_items: "id, user_id, updated_at, deleted_at",
  transactions:
    "id, user_id, category_id, loan_id, account_id, goal_id, grocery_item_id, occurred_at, updated_at, deleted_at",
});

db.version(8).stores({
  grocery_purchases: "id, user_id, grocery_item_id, purchased_at, updated_at, deleted_at",
});

// Households: financial rows now carry household_id, and two read-only local
// mirrors of the membership tables so household scoping works offline.
db.version(9).stores({
  categories: "id, user_id, household_id, updated_at, deleted_at",
  transactions:
    "id, user_id, household_id, category_id, loan_id, account_id, goal_id, grocery_item_id, occurred_at, updated_at, deleted_at",
  budgets: "id, user_id, household_id, category_id, month, updated_at, deleted_at",
  loans: "id, user_id, household_id, updated_at, deleted_at",
  accounts: "id, user_id, household_id, updated_at, deleted_at",
  recurring_transactions: "id, user_id, household_id, updated_at, deleted_at",
  savings_goals: "id, user_id, household_id, updated_at, deleted_at",
  grocery_items: "id, user_id, household_id, updated_at, deleted_at",
  grocery_purchases: "id, user_id, household_id, grocery_item_id, purchased_at, updated_at, deleted_at",
  households: "id, updated_at",
  household_members: "[household_id+user_id], user_id, household_id, updated_at",
});

export default db;
