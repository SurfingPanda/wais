"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { runSync, subscribeSync, getSyncState, resetLocalData, type SyncStatus } from "./sync";
import { generateDueTransactions } from "./actions/recurring";
import { migrateLegacyGroceryTransactions } from "./actions/groceries";
import { todayLocalDate } from "./format";

const SYNC_INTERVAL_MS = 60_000;

// Which account the local Dexie data belongs to. If the signed-in user ever
// differs from this, the local store is another account's and gets wiped.
const DATA_OWNER_KEY = "wais-data-owner";

function readOwner(): string | null {
  try {
    return localStorage.getItem(DATA_OWNER_KEY);
  } catch {
    return null;
  }
}
function writeOwner(userId: string) {
  try {
    localStorage.setItem(DATA_OWNER_KEY, userId);
  } catch {
    /* private mode / storage disabled — nothing we can do */
  }
}
function clearOwner() {
  try {
    localStorage.removeItem(DATA_OWNER_KEY);
  } catch {
    /* ignore */
  }
}

export function useSyncStatus() {
  const [state, setState] = useState(getSyncState());
  useEffect(() => subscribeSync(setState), []);
  return state;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // The account whose owner check has finished. Derived `dataReady` gates the
  // sync/migrate effects below so a stale account's data can't be synced or
  // read before it's cleared — and it flips false automatically the moment
  // `userId` changes, with no setState in the effect body.
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const dataReady = userId !== null && readyFor === userId;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const owner = readOwner();
      if (userId) {
        // A different account than the local data belongs to — wipe first.
        if (owner && owner !== userId) await resetLocalData();
        writeOwner(userId);
      } else if (owner) {
        // Signed out: clear everything so the next user starts clean.
        await resetLocalData();
        clearOwner();
      }
      if (!cancelled) setReadyFor(userId);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // One-time cleanup left over from the brief period grocery purchases were
  // recorded as real expense transactions — see migrateLegacyGroceryTransactions.
  // Naturally idempotent, so re-running it on every login is harmless.
  useEffect(() => {
    if (!userId || !dataReady) return;
    void migrateLegacyGroceryTransactions(userId);
  }, [userId, dataReady]);

  useEffect(() => {
    if (!userId || !dataReady) return;

    // Recurring transactions are materialized locally (works offline) before
    // each sync pass, so any transactions they generate get pushed too.
    function tick() {
      generateDueTransactions(userId!, todayLocalDate()).finally(() => runSync(userId));
    }

    tick();

    const onOnline = () => tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(tick, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(interval);
    };
  }, [userId, dataReady]);

  return children;
}

export type { SyncStatus };
