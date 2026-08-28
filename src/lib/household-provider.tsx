"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "./db";
import { supabase } from "./supabase";
import { useAuth } from "./auth-provider";
import { runSync, resetLocalData } from "./sync";
import {
  ACTIVE_HOUSEHOLD_KEY as ACTIVE_KEY,
  HOUSEHOLD_SCOPE_KEY as SCOPE_KEY,
  readLS,
  writeLS,
  clearLS,
} from "./household-scope";
import type { Household, HouseholdMember } from "./types";

// Makes sure the account has a household (creating a personal one on first
// run), then syncs so its membership comes down. No-op when one already
// exists or the device is offline. Called by the provider on mount and by
// the onboarding wizard before it seeds starter data.
export async function ensureHousehold(userId: string): Promise<void> {
  if ((await db.household_members.where("user_id").equals(userId).count()) > 0) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  const { data, error: readErr } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .limit(1);
  // Households migration not applied yet — nothing to do; sync stays on the
  // legacy user_id path.
  if (readErr) return;
  if (!data || data.length === 0) {
    const { error } = await supabase.rpc("create_household", { household_name: "My household" });
    if (error) console.error("[household] create failed", error);
  }
  await runSync(userId);
}

interface HouseholdContextValue {
  householdId: string | null;
  household: Household | null;
  members: HouseholdMember[];
  loading: boolean;
}

const HouseholdContext = createContext<HouseholdContextValue>({
  householdId: null,
  household: null,
  members: [],
  loading: true,
});

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const members = useLiveQuery(
    () =>
      userId
        ? db.household_members.where("user_id").equals(userId).toArray()
        : Promise.resolve([] as HouseholdMember[]),
    [userId],
  );
  const households = useLiveQuery(() => db.households.toArray(), []);

  const loading = members === undefined;

  // Prefer the explicitly-activated household (if still a member), else the
  // one joined earliest.
  const memberList = members ?? [];
  const active = readLS(ACTIVE_KEY);
  const householdId =
    (active && memberList.some((m) => m.household_id === active) && active) ||
    [...memberList].sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0]?.household_id ||
    null;

  const household = (households ?? []).find((h) => h.id === householdId) ?? null;

  // Brand-new account with no household yet: create a personal one, then sync
  // so its membership comes back down.
  const bootstrapping = useRef(false);
  useEffect(() => {
    if (!userId || loading || bootstrapping.current) return;
    if (memberList.length === 0 && typeof navigator !== "undefined" && navigator.onLine) {
      bootstrapping.current = true;
      void ensureHousehold(userId).finally(() => {
        bootstrapping.current = false;
      });
    }
  }, [userId, loading, memberList.length]);

  // If the resolved household changes out from under the local data (a
  // membership was revoked, or the active one switched elsewhere), the cache
  // is another household's — wipe and reload clean.
  useEffect(() => {
    if (loading || !userId) return;
    const scope = readLS(SCOPE_KEY);
    if (householdId && !scope) {
      writeLS(SCOPE_KEY, householdId);
      return;
    }
    if (scope && householdId !== scope) {
      clearLS(SCOPE_KEY);
      void resetLocalData().then(() => window.location.reload());
    }
  }, [loading, userId, householdId]);

  return (
    <HouseholdContext.Provider value={{ householdId, household, members: memberList, loading }}>
      {children}
    </HouseholdContext.Provider>
  );
}

export function useHousehold() {
  return useContext(HouseholdContext);
}

// Called by the join/leave flows: point the app at `id` (or clear), drop the
// local cache, and reload so everything re-syncs for the new scope.
export async function switchHousehold(id: string | null) {
  if (id) writeLS(ACTIVE_KEY, id);
  else clearLS(ACTIVE_KEY);
  clearLS(SCOPE_KEY);
  await resetLocalData();
  window.location.assign("/dashboard");
}
