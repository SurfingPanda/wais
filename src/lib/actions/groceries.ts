import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import { createTransaction, deleteTransaction } from "./transactions";
import { findOrCreateCategoryByName } from "./categories";
import type { GroceryItem, GroceryPurchase } from "../types";

// Category a receipt's total expense is filed under when "also log as expense"
// is on. Created on first use if the user doesn't already have it.
const RECEIPT_EXPENSE_CATEGORY = "Groceries";

export interface GroceryItemInput {
  name: string;
  restock_interval_days: number | null;
}

export async function createGroceryItem(userId: string, input: GroceryItemInput) {
  const now = new Date().toISOString();
  const item: GroceryItem = {
    id: crypto.randomUUID(),
    user_id: userId,
    ...input,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.grocery_items.put(item);
  await enqueueMutation({ table: "grocery_items", op: "insert", recordId: item.id, payload: item });
  void runSync(userId);
  return item;
}

export async function updateGroceryItem(userId: string, id: string, input: GroceryItemInput) {
  const existing = await db.grocery_items.get(id);
  if (!existing) throw new Error("Grocery item not found");

  const updated: GroceryItem = { ...existing, ...input, updated_at: new Date().toISOString() };
  await db.grocery_items.put(updated);
  await enqueueMutation({
    table: "grocery_items",
    op: "update",
    recordId: id,
    payload: { id, ...input },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

// Soft-deletes the item. Purchases already logged stay on record as price
// history (deleteGroceryItem doesn't cascade to them).
export async function deleteGroceryItem(userId: string, id: string) {
  const existing = await db.grocery_items.get(id);
  if (!existing) return;

  const deletedAt = new Date().toISOString();
  await db.grocery_items.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "grocery_items",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}

// Records what an item cost and when. Deliberately just that — not an
// expense transaction, so it never touches accounts, budgets, or category
// spending. It only feeds restock timing/last-price on the Groceries page.
export async function recordGroceryPurchase(
  userId: string,
  item: GroceryItem,
  price: number,
  purchasedAt: string,
) {
  const now = new Date().toISOString();
  const purchase: GroceryPurchase = {
    id: crypto.randomUUID(),
    user_id: userId,
    grocery_item_id: item.id,
    price,
    purchased_at: purchasedAt,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.grocery_purchases.put(purchase);
  await enqueueMutation({
    table: "grocery_purchases",
    op: "insert",
    recordId: purchase.id,
    payload: purchase,
  });
  void runSync(userId);
  return purchase;
}

// Reuses an existing item with the same name (case/whitespace-insensitive)
// so repeat purchases keep accumulating the same restock history instead of
// splintering into near-duplicate items, and only creates a new one when
// nothing matches.
export async function findOrCreateGroceryItemByName(userId: string, name: string) {
  const trimmed = name.trim();
  const existing = await db.grocery_items
    .where("user_id")
    .equals(userId)
    .filter((i) => !i.deleted_at && i.name.trim().toLowerCase() === trimmed.toLowerCase())
    .first();
  if (existing) return existing;

  return createGroceryItem(userId, { name: trimmed, restock_interval_days: null });
}

export interface ReceiptLine {
  name: string;
  price: number;
}

// Logs every line of a receipt as its own purchase, all dated the same day.
// Each line resolves (or creates) its grocery item first, so a receipt is
// really just a fast way to record several prices at once.
//
// With `logExpense`, the receipt total is also written as a single expense
// transaction in the "Groceries" category (created if missing) so the spend
// counts toward that category's budget — the per-line purchases above never
// do (see recordGroceryPurchase). `merchant`, when given, becomes the store
// name in that transaction's description. No grocery_item_id is set on it:
// that tag is reserved for the legacy rows migrateLegacyGroceryTransactions
// cleans up.
export async function recordGroceryReceipt(
  userId: string,
  lines: ReceiptLine[],
  purchasedAt: string,
  options: { logExpense?: boolean; merchant?: string | null } = {},
) {
  const recorded = [];
  for (const line of lines) {
    const item = await findOrCreateGroceryItemByName(userId, line.name);
    recorded.push(await recordGroceryPurchase(userId, item, line.price, purchasedAt));
  }

  if (options.logExpense) {
    const total =
      Math.round(lines.reduce((sum, l) => sum + (Number.isFinite(l.price) ? l.price : 0), 0) * 100) /
      100;
    if (total > 0) {
      const category = await findOrCreateCategoryByName(userId, RECEIPT_EXPENSE_CATEGORY);
      const merchant = options.merchant?.trim();
      const itemCount = `${lines.length} item${lines.length === 1 ? "" : "s"}`;
      await createTransaction(userId, {
        amount: total,
        type: "expense",
        description: merchant ? `${merchant} · ${itemCount}` : `Grocery receipt · ${itemCount}`,
        category_id: category.id,
        occurred_at: purchasedAt,
      });
    }
  }

  return recorded;
}

// One-time cleanup for the brief period grocery purchases were recorded as
// real expense transactions (tagged via transaction.grocery_item_id). Turns
// each one still around into a proper grocery_purchases row, then removes
// the transaction so it stops counting against balances/budgets. Safe to
// call repeatedly — becomes a no-op once nothing matches.
export async function migrateLegacyGroceryTransactions(userId: string) {
  const legacy = await db.transactions
    .where("user_id")
    .equals(userId)
    .filter((t) => !t.deleted_at && !!t.grocery_item_id)
    .toArray();

  for (const t of legacy) {
    if (!t.grocery_item_id) continue;
    const now = new Date().toISOString();
    const purchase: GroceryPurchase = {
      id: crypto.randomUUID(),
      user_id: userId,
      grocery_item_id: t.grocery_item_id,
      price: t.amount,
      purchased_at: t.occurred_at,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    };
    await db.grocery_purchases.put(purchase);
    await enqueueMutation({
      table: "grocery_purchases",
      op: "insert",
      recordId: purchase.id,
      payload: purchase,
    });
    await deleteTransaction(userId, t.id);
  }

  if (legacy.length > 0) void runSync(userId);
}
