"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { useSyncStatus } from "@/lib/sync-provider";
import { useAuth } from "@/lib/auth-provider";
import { runSync } from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SyncIndicator() {
  const { status, pendingCount, lastError, lastSyncedAt, retryCount } = useSyncStatus();
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const lastSyncLabel = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;
  const label = !isOnline
    ? `Offline${pendingCount > 0 ? ` • ${pendingCount} pending` : ""}`
    : status === "syncing"
      ? "Syncing..."
      : status === "error"
        ? "Retry sync"
        : pendingCount > 0
          ? `${pendingCount} pending`
          : "Synced";

  const Icon = !isOnline
    ? CloudOff
    : status === "syncing"
      ? RefreshCw
      : status === "error"
        ? AlertCircle
        : CheckCircle2;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-2 text-xs text-muted-foreground"
      disabled={!isOnline || !user || status === "syncing"}
      title={
        status === "error" && lastError
          ? `${lastError} (tap to retry)`
          : lastSyncLabel
            ? `Last successful sync at ${lastSyncLabel}`
            : "No successful sync yet"
      }
      onClick={() => {
        if (user) {
          if (status === "error") toast.info("Retrying sync…");
          void runSync(user.id);
        }
      }}
    >
      <Icon className={`h-3.5 w-3.5 ${status === "syncing" ? "animate-spin" : ""}`} />
      {label}
      {status === "syncing" && retryCount > 0 ? ` (${retryCount}/3)` : null}
      {status !== "syncing" && lastSyncLabel ? ` · ${lastSyncLabel}` : null}
    </Button>
  );
}
