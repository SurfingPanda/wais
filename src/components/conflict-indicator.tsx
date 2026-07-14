"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { AlertTriangle, X } from "lucide-react";
import db from "@/lib/db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TABLE_LABELS: Record<string, string> = {
  categories: "category",
  transactions: "transaction",
  budgets: "budget",
  loans: "loan",
  accounts: "account",
  recurring_transactions: "recurring transaction",
};

function conflictLabel(payload: object) {
  const p = payload as Record<string, unknown>;
  return (p.description as string) || (p.name as string) || null;
}

// Surfaces mutations that lost a race — another device changed the same
// record first, so the local edit was dropped rather than silently
// overwriting theirs. This only detects and reports; the user redoes the
// change themselves if they still want it.
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
            Someone else changed these first, so your edit here wasn&apos;t saved. Open the
            record and redo the change if you still want it.
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
              <button
                type="button"
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => c.id !== undefined && db.conflicts.delete(c.id)}
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
