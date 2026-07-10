import db from "./db";
import { supabase } from "./supabase";
import type { SyncTable } from "./types";

// Loans and accounts come before transactions so pulled transactions never
// reference a loan/account the local db hasn't seen yet.
const TABLES: SyncTable[] = ["categories", "loans", "accounts", "transactions", "budgets"];
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

// Sends every queued local mutation to Supabase, in the order it was made.
// Stops at the first failure (e.g. connection drops mid-sync) and leaves
// the rest queued for the next run — except row-level-security rejections
// (Postgres 42501), which are permanent (e.g. a record whose user_id
// predates a Supabase project reset) and would otherwise wedge every
// future sync behind a mutation that can never apply. Those are dropped
// instead, so one bad record can't block everything else forever.
async function pushMutations() {
  const mutations = await db.mutations.orderBy("createdAt").toArray();

  for (const mutation of mutations) {
    const table = supabase.from(mutation.table);
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
    // @ts-expect-error -- table name is dynamic, shape matches per-table row type
    await db[table].bulkPut(data);
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
