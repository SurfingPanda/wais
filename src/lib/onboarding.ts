import db from "./db";
import { createCategory } from "./actions/categories";

// Offered on first run — a spread of everyday categories, each with a
// distinct colour, all pre-selected. The user trims the list; nothing here
// is mandatory.
export const STARTER_CATEGORIES: { name: string; color: string }[] = [
  { name: "Groceries", color: "#84cc16" },
  { name: "Dining Out", color: "#f97316" },
  { name: "Transport", color: "#3b82f6" },
  { name: "Rent & Bills", color: "#8b5cf6" },
  { name: "Shopping", color: "#ec4899" },
  { name: "Health", color: "#ef4444" },
  { name: "Entertainment", color: "#06b6d4" },
  { name: "Savings", color: "#10b981" },
  { name: "Income", color: "#14b8a6" },
];

// Derives a friendly first name from the sign-up email, for the greeting
// field's default (the user can overwrite it).
export function nameFromEmail(email: string | null | undefined): string {
  const local = (email ?? "").split("@")[0] ?? "";
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// Creates the chosen starter categories, skipping any the user already has
// (by case-insensitive name) so it's harmless if it ever runs twice.
export async function seedStarterCategories(userId: string, chosen: string[]) {
  const pick = new Set(chosen);
  const existing = new Set(
    (await db.categories.toArray()).map((c) => c.name.trim().toLowerCase()),
  );
  for (const { name, color } of STARTER_CATEGORIES) {
    if (pick.has(name) && !existing.has(name.toLowerCase())) {
      await createCategory(userId, { name, color });
    }
  }
}
