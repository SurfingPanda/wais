import db from "../db";
import { enqueueMutation, runSync } from "../sync";
import type { Category } from "../types";

export async function createCategory(
  userId: string,
  input: { name: string; color: string; rollover?: boolean },
) {
  const now = new Date().toISOString();
  const category: Category = {
    id: crypto.randomUUID(),
    user_id: userId,
    name: input.name,
    color: input.color,
    rollover: input.rollover ?? false,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };

  await db.categories.put(category);
  await enqueueMutation({ table: "categories", op: "insert", recordId: category.id, payload: category });
  void runSync(userId);
  return category;
}

// Reuses a category with this name (case/whitespace-insensitive) and only
// creates one when nothing matches, so "also log as expense" flows don't
// spawn duplicate categories on repeat use.
export async function findOrCreateCategoryByName(userId: string, name: string) {
  const trimmed = name.trim();
  const existing = await db.categories
    .where("user_id")
    .equals(userId)
    .filter((c) => !c.deleted_at && c.name.trim().toLowerCase() === trimmed.toLowerCase())
    .first();
  if (existing) return existing;

  // lime-500 — matches the grocery UI accent.
  return createCategory(userId, { name: trimmed, color: "#84cc16" });
}

export async function updateCategory(
  userId: string,
  id: string,
  input: { name: string; color: string; rollover?: boolean },
) {
  const existing = await db.categories.get(id);
  if (!existing) throw new Error("Category not found");

  const rollover = input.rollover ?? false;
  const updated: Category = { ...existing, ...input, rollover, updated_at: new Date().toISOString() };
  await db.categories.put(updated);
  await enqueueMutation({
    table: "categories",
    op: "update",
    recordId: id,
    payload: { id, name: input.name, color: input.color, rollover },
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
  return updated;
}

export async function deleteCategory(userId: string, id: string) {
  const existing = await db.categories.get(id);
  if (!existing) return;

  const deletedAt = new Date().toISOString();
  await db.categories.put({ ...existing, deleted_at: deletedAt, updated_at: deletedAt });
  await enqueueMutation({
    table: "categories",
    op: "delete",
    recordId: id,
    payload: {},
    baseUpdatedAt: existing.updated_at,
  });
  void runSync(userId);
}
