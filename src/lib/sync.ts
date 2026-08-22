import db from "./db";
import { supabase } from "./supabase";
import type { SyncTable, Mutation } from "./types";

// Loans and accounts come before transactions so pulled transactions never
// reference a loan/account the local db hasn't seen yet. Recurring rules
// come before transactions for the same reason (generated transactions
// don't reference them directly, but categories/accounts they point to
// are already guaranteed available by this point).
const TABLES: SyncTable[] = [
  "categories",
  "loans",
  "accounts",
  "savings_goals",
  "grocery_items",
  "grocery_purchases",
  "recurring_transactions",
  "transactions",
  "budgets",
];
const EPOCH = "1970-01-01T00:00:00.000Z";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

let state: SyncState = {
  status: "idle",
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
};

const listeners = new Set<(s: SyncState) => void>();

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((cb) => cb(state));
}

export function subscribeSync(cb: (s: SyncState) => void) {
  listeners.add(cb);
  cb(state);
  return () => {
    listeners.delete(cb);
  };
}

export function getSyncState() {
  return state;
}

async function refreshPendingCount() {
  const pendingCount = await db.mutations.count();
  setState({ pendingCount });
}

// Records what a conflicting mutation would have written, without applying
// it, so the user can see it and decide whether to redo the change against
// the current (someone-else's-newer) version instead of silently losing it.
async function recordConflict(mutation: Mutation) {
  await db.conflicts.add({
    table: mutation.table,
    recordId: mutation.recordId,
    op: mutation.op,
    localPayload: mutation.payload,
    detectedAt: new Date().toISOString(),
  });
}

// Sends every queued local mutation to Supabase, in the order it was made.
// Stops at the first failure (e.g. connection drops mid-sync) and leaves
// the rest queued for the next run — except row-level-security rejections
// (Postgres 42501), which are permanent (e.g. a record whose user_id
// predates a Supabase project reset) and would otherwise wedge every
// future sync behind a mutation that can never apply. Those are dropped
// instead, so one bad record can't block everything else forever.
async function pushMutations() {
  const mutations = await db.mutations.orderBy("createdAt").toArray();

  // Grouped by record, not pushed one by one — a chain of local edits to the
  // same row made back-to-back while offline each bump the row's local
  // updated_at, so only the *first* mutation's baseUpdatedAt still reflects
  // the last value the server actually had. Checking every mutation
  // individually against the server would false-positive on the later ones
  // in the chain, since the server re-stamps updated_at with its own clock
  // on every write and would never match an intermediate local timestamp.
  // One check per record — using the earliest edit's base version — covers
  // the whole chain correctly.
  const groups = new Map<string, Mutation[]>();
  for (const mutation of mutations) {
    const key = `${mutation.table}:${mutation.recordId}`;
    const group = groups.get(key);
    if (group) group.push(mutation);
    else groups.set(key, [mutation]);
  }

  for (const group of groups.values()) {
    const [first] = group;
    const table = supabase.from(first.table);

    if (first.baseUpdatedAt && first.op !== "insert") {
      const { data: current, error: fetchError } = await table
        .select("updated_at")
        .eq("id", first.recordId)
        .maybeSingle();

      if (!fetchError && current && current.updated_at !== first.baseUpdatedAt) {
        // Someone else changed this record since our chain of local edits
        // started — none of them are safe to apply. Report the most recent
        // local edit as the conflict (the fullest picture of local intent).
        await recordConflict(group[group.length - 1]);
        for (const mutation of group) {
          if (mutation.id !== undefined) await db.mutations.delete(mutation.id);
        }
        continue;
      }
      // A failed read or a since-deleted row falls through to the normal
      // write below — fail open rather than block sync on a side check.
    }

    for (const mutation of group) {
      let error;
      if (mutation.op === "delete") {
        ({ error } = await table
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", mutation.recordId));
      } else {
        ({ error } = await table.upsert(mutation.payload));
      }

      if (error) {
        if (error.code === "42501") {
          console.warn(
            `Dropping unrecoverable ${mutation.table} ${mutation.op} mutation (RLS denied): ${error.message}`,
          );
          if (mutation.id !== undefined) await db.mutations.delete(mutation.id);
          continue;
        }
        throw new Error(`${mutation.table} ${mutation.op} failed: ${error.message}`);
      }
      if (mutation.id !== undefined) await db.mutations.delete(mutation.id);
    }
  }
}

// Pulls rows changed since the last successful pull for this table. The
// query window is captured before the request goes out (not read back from
// Supabase), so it stays correct even though it relies on the client clock.
async function pullTable(table: SyncTable, userId: string) {
  const meta = await db.syncMeta.get(table);
  const since = meta?.lastSyncedAt ?? EPOCH;
  const queryStartedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(5000);

  if (error) throw new Error(`${table} pull failed: ${error.message}`);

  if (data && data.length > 0) {
    // A record can pick up a new queued mutation mid-cycle — enqueued after
    // this run's pushMutations() already went out, but before this pull
    // lands — if the user edits it while sync is in flight. That local edit
    // is intentionally ahead of whatever the server just returned; applying
    // the pull would silently overwrite it with no conflict recorded. Skip
    // those specific rows and let the next sync cycle (which pushes the new
    // mutation first) reconcile them.
    const pending = await db.mutations.where("table").equals(table).toArray();
    const pendingIds = new Set(pending.map((m) => m.recordId));
    const toApply = pendingIds.size > 0 ? data.filter((row) => !pendingIds.has(row.id)) : data;
    if (toApply.length > 0) {
      // @ts-expect-error -- table name is dynamic, shape matches per-table row type
      await db[table].bulkPut(toApply);
    }
  }

  await db.syncMeta.put({ table, lastSyncedAt: queryStartedAt });
}

let syncing = false;

export async function runSync(userId: string | null) {
  if (syncing) return;
  if (!userId) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    setState({ status: "offline" });
    return;
  }

  // Every tab of this device shares the same IndexedDB, so two tabs syncing
  // at once could both read the mutation queue, push overlapping groups, or
  // have one tab's pull bulkPut land mid-way through another tab's push. The
  // `syncing` flag above only guards within a single tab; the Web Locks API
  // (supported in every browser this PWA targets) gives real cross-tab
  // mutual exclusion. `ifAvailable` means a tab that loses the race skips
  // its run entirely rather than queuing — whichever tab is already
  // syncing will pull in the same changes this run would have.
  if (typeof navigator !== "undefined" && navigator.locks) {
    await navigator.locks.request("wais-sync", { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await runSyncLocked(userId);
    });
  } else {
    await runSyncLocked(userId);
  }
}

async function runSyncLocked(userId: string) {
  syncing = true;
  setState({ status: "syncing", lastError: null });

  try {
    await pushMutations();
    for (const table of TABLES) {
      await pullTable(table, userId);
    }
    await refreshPendingCount();
    setState({ status: "idle", lastSyncedAt: new Date().toISOString() });
  } catch (err) {
    await refreshPendingCount();
    setState({ status: "error", lastError: err instanceof Error ? err.message : String(err) });
  } finally {
    syncing = false;
  }
}

export async function enqueueMutation(mutation: Omit<import("./types").Mutation, "id" | "createdAt">) {
  await db.mutations.add({ ...mutation, createdAt: new Date().toISOString() });
  await refreshPendingCount();
}
