import { describe, expect, it } from "vitest";
import { buildFinancialContext, type FinancialContextData } from "./chat-context";
import type {
  Account,
  Budget,
  Category,
  GroceryItem,
  GroceryPurchase,
  Loan,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
} from "@/lib/types";

const timestamp = "2026-09-01T00:00:00.000Z";
const ownership = { user_id: "user-1", household_id: "household-1" };

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "category-1",
    ...ownership,
    name: "Groceries",
    color: "#10b981",
    rollover: false,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    ...overrides,
  };
}

function account(overrides: Partial<Account> = {}): Account {
  return {
    id: "account-1",
    ...ownership,
    name: "Everyday checking",
    type: "checking",
    starting_balance: 1_000,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "transaction-1",
    ...ownership,
    category_id: "category-1",
    account_id: "account-1",
    amount: 100,
    type: "expense",
    description: "Weekly groceries",
    occurred_at: "2026-09-10",
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    ...overrides,
  };
}

function completeData(): FinancialContextData {
  const budgets: Budget[] = [
    {
      id: "budget-1",
      ...ownership,
      category_id: "category-1",
      month: "2026-09-01",
      amount: 500,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    },
  ];
  const goals: SavingsGoal[] = [
    {
      id: "goal-1",
      ...ownership,
      name: "Emergency fund",
      target_amount: 5_000,
      target_date: "2027-06-01",
      category_id: null,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    },
  ];
  const loans: Loan[] = [
    {
      id: "loan-1",
      ...ownership,
      name: "Laptop loan",
      principal: 1_200,
      payment_type: "recurring",
      monthly_payment: 100,
      due_day: 25,
      category_id: null,
      account_id: "account-1",
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    },
  ];
  const recurringTransactions: RecurringTransaction[] = [
    {
      id: "recurring-1",
      ...ownership,
      category_id: null,
      account_id: "account-1",
      amount: 2_000,
      type: "income",
      description: "Salary",
      frequency: "monthly",
      day_of_month: 1,
      weekday: null,
      start_date: "2026-01-01",
      end_date: null,
      last_generated_date: "2026-09-01",
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    },
  ];
  const groceryItems: GroceryItem[] = [
    {
      id: "grocery-1",
      ...ownership,
      name: "Rice",
      restock_interval_days: 14,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    },
  ];
  const groceryPurchases: GroceryPurchase[] = [
    {
      id: "purchase-1",
      ...ownership,
      grocery_item_id: "grocery-1",
      price: 25,
      purchased_at: "2026-09-05",
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    },
  ];

  return {
    accounts: [account()],
    budgets,
    categories: [category()],
    groceryItems,
    groceryPurchases,
    goals,
    loans,
    recurringTransactions,
    transactions: [
      transaction({ id: "income", type: "income", amount: 2_000, description: "Salary", category_id: null }),
      transaction({ id: "expense", description: "Weekly\ngroceries" }),
      transaction({ id: "loan-payment", loan_id: "loan-1", amount: 100, description: "Laptop payment" }),
      transaction({ id: "goal", goal_id: "goal-1", amount: 250, description: "Goal contribution" }),
    ],
  };
}

describe("buildFinancialContext", () => {
  it("includes every household finance domain in a bounded snapshot", () => {
    const context = buildFinancialContext(completeData(), "USD", "2026-09-20");

    expect(context).toContain("Current-month summary:");
    expect(context).toContain("Accounts (estimated net worth");
    expect(context).toContain("Everyday checking (checking)");
    expect(context).toContain("Current budgets:");
    expect(context).toContain("Groceries:");
    expect(context).toContain("Savings goals:");
    expect(context).toContain("Emergency fund:");
    expect(context).toContain("Loans and payment schedules:");
    expect(context).toContain("Laptop loan:");
    expect(context).toContain("Recurring transactions:");
    expect(context).toContain("Salary: income");
    expect(context).toContain("Groceries and restock history:");
    expect(context).toContain("Rice:");
    expect(context).toContain("Recent transaction details (newest 4 of 4):");
    expect(context).toContain("Loan payment");
    expect(context).toContain("Savings contribution");
    expect(context).toContain("Monthly trends (last 12 months):");
    expect(context).toContain("September 2026:");
  });

  it("normalizes user-authored text and excludes soft-deleted records", () => {
    const data = completeData();
    data.transactions = [
      transaction({ description: "Line one\n\nLine two" }),
      transaction({ id: "deleted", description: "Secret deleted record", deleted_at: timestamp }),
    ];
    data.accounts.push(account({ id: "deleted-account", name: "Deleted account", deleted_at: timestamp }));

    const context = buildFinancialContext(data, "USD", "2026-09-20");

    expect(context).toContain("Line one Line two");
    expect(context).not.toContain("Secret deleted record");
    expect(context).not.toContain("Deleted account");
  });
});
