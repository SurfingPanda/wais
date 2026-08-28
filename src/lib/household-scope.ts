// Per-device household selection, kept in its own module (no React) so both
// the household provider and the sync provider can touch it.

// The household the app is currently showing. Set by the join/leave flows.
export const ACTIVE_HOUSEHOLD_KEY = "wais-active-household";
// The household id the local cache currently belongs to. If the resolved id
// ever differs, the cache is stale and gets wiped.
export const HOUSEHOLD_SCOPE_KEY = "wais-household-scope";

export function readLS(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled */
  }
}
export function clearLS(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// Called on sign-out / account switch so a stale household id doesn't carry
// into the next account.
export function clearHouseholdScope() {
  clearLS(ACTIVE_HOUSEHOLD_KEY);
  clearLS(HOUSEHOLD_SCOPE_KEY);
}
