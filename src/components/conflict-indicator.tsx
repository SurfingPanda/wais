"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import db from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { retryConflict } from "@/lib/sync";
import { toast } from "sonner";

const TABLE_LABELS: Record<string, string> = {
  categories: "category",
  transactions: "transaction",
  budgets: "budget",
  loans: "loan",
  accounts: "account",
  recurring_transactions: "recurring transaction",
  savings_goals: "savings goal",
};

function conflictLabel(payload: object) {
  const p = payload as Record<string, unknown>;
  return (p.description as string) || (p.name as string) || null;
}

// Surfaces mutations that lost a race — another device changed the same
// record first, so the local edit was dropped rather than silently
// overwriting theirs. The user can explicitly re-queue the preserved edit.
export function ConflictIndicator() {
  const conflicts = useLiveQuery(() => db.conflicts.orderBy("detectedAt").reverse().toArray());

  if (!conflicts || conflicts.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs text-amber-600 dark:text-amber-400"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-72">
        <div className="px-1.5 py-1.5">
          <p className="text-sm font-medium">Sync conflicts</p>
          <p className="text-xs text-muted-foreground">
            Someone else changed these first. Retry your saved edit to apply it over the latest
            version, or dismiss it.
          </p>
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 space-y-0.5 overflow-y-auto p-1">
          {conflicts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-sm"
            >
              <span className="min-w-0 truncate">
                {conflictLabel(c.localPayload) ?? "A record"}{" "}
                <span className="text-xs text-muted-foreground">
                  · {TABLE_LABELS[c.table] ?? c.table}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    if (c.id === undefined) return;
                    void retryConflict(c.id).then((retried) => {
                      if (retried) toast.success("Edit queued for sync");
                    });
                  }}
                  aria-label="Retry this edit"
                  title="Retry this edit"
                >
                  <RotateCcw className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => c.id !== undefined && db.conflicts.delete(c.id)}
                  aria-label="Dismiss conflict"
                  title="Dismiss conflict"
                >
                  <X className="size-3.5" />
                </button>
              </span>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
