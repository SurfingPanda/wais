"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { runSync, subscribeSync, getSyncState, type SyncStatus } from "./sync";
import { generateDueTransactions } from "./actions/recurring";
import { migrateLegacyGroceryTransactions } from "./actions/groceries";
import { todayLocalDate } from "./format";

const SYNC_INTERVAL_MS = 60_000;

export function useSyncStatus() {
  const [state, setState] = useState(getSyncState());
  useEffect(() => subscribeSync(setState), []);
  return state;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // One-time cleanup left over from the brief period grocery purchases were
  // recorded as real expense transactions — see migrateLegacyGroceryTransactions.
  // Naturally idempotent, so re-running it on every login is harmless.
  useEffect(() => {
    if (!userId) return;
    void migrateLegacyGroceryTransactions(userId);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Recurring transactions are materialized locally (works offline) before
    // each sync pass, so any transactions they generate get pushed too.
    function tick() {
      generateDueTransactions(userId!, todayLocalDate()).finally(() => runSync(userId));
    }

    tick();

    const onOnline = () => tick();
    window.addEventListener("online", onOnline);
    const interval = setInterval(tick, SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [userId]);

  return children;
}

export type { SyncStatus };
