"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-provider";
import { runSync, subscribeSync, getSyncState, type SyncStatus } from "./sync";

const SYNC_INTERVAL_MS = 60_000;

export function useSyncStatus() {
  const [state, setState] = useState(getSyncState());
  useEffect(() => subscribeSync(setState), []);
  return state;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    runSync(userId);

    const onOnline = () => runSync(userId);
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => runSync(userId), SYNC_INTERVAL_MS);

    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [userId]);

  return children;
}

export type { SyncStatus };
