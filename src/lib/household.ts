import type { HouseholdMember } from "./types";
import db from "./db";
import { ACTIVE_HOUSEHOLD_KEY, readLS } from "./household-scope";

/** Rows created before household support are still visible in the user's personal household. */
export function belongsToHousehold<T extends { user_id: string; household_id?: string | null }>(
  row: T,
  userId: string,
  householdId: string | null,
) {
  if (row.household_id) return row.household_id === householdId;
  // Before membership sync (or on an older database), retain the legacy
  // user-owned scope rather than blanking the offline cache.
  return row.user_id === userId;
}

export function resolveHouseholdId(
  members: HouseholdMember[],
  activeId: string | null,
) {
  return (
    (activeId && members.some((member) => member.household_id === activeId) && activeId) ||
    [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0]?.household_id ||
    null
  );
}

export async function getActiveHouseholdId(userId: string) {
  const members = await db.household_members.where("user_id").equals(userId).toArray();
  return resolveHouseholdId(members, readLS(ACTIVE_HOUSEHOLD_KEY));
}
