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

export interface SyncState {
  status: SyncStatus;
  pendingCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  retryCount: number;
}

const MAX_SYNC_RETRIES = 3;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000];
const LAST_SUCCESSFUL_SYNC_PREFIX = "wais-last-successful-sync:";

let state: SyncState = {
  status: "idle",
  pendingCount: 0,
  lastSyncedAt: null,
  lastError: null,
  retryCount: 0,
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

/** Re-queue a conflict only after the user explicitly chooses to retry it. */
export async function retryConflict(conflictId: number) {
  const conflict = await db.conflicts.get(conflictId);
  if (!conflict) return false;
  await enqueueMutation({
    table: conflict.table,
    op: conflict.op,
    recordId: conflict.recordId,
    payload: conflict.localPayload,
  });
  await db.conflicts.delete(conflictId);
  return true;
}

function readLastSuccessfulSync(userId: string) {
  if (typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(`${LAST_SUCCESSFUL_SYNC_PREFIX}${userId}`);
  } catch {
    return null;
  }
}

function writeLastSuccessfulSync(userId: string, value: string) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(`${LAST_SUCCESSFUL_SYNC_PREFIX}${userId}`, value);
  } catch {
    /* storage can be disabled in private browsing */
  }
}

function isRetryableSyncError(error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  // Validation, constraint, auth/RLS, and missing-schema errors are not fixed
  // by waiting. Network failures and transient Supabase errors are.
  if (code && (code.startsWith("22") || code.startsWith("23") || code.startsWith("42"))) {
    return false;
  }
  return code !== "42501" && code !== "PGRST116";
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function syncFailure(message: string, code?: string) {
  const failure = new Error(message) as Error & { code?: string };
  failure.code = code;
  return failure;
}

// Mutations used to store a small patch for updates. That is fine for a true
// SQL UPDATE, but this sync protocol intentionally uses upsert so an offline
// record can still be created remotely. An upsert needs every required
// column, particularly user_id. Resolve updates to the current local row at
// send time both for new writes and for partial mutations already sitting in
// IndexedDB from an older app version.
async function fullPayloadFor(mutation: Mutation) {
  if (mutation.op !== "update") return mutation.payload;
  const localTable = db[mutation.table] as { get: (id: string) => Promise<object | undefined> };
  return (await localTable.get(mutation.recordId)) ?? mutation.payload;
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
        ({ error } = await table.upsert(await fullPayloadFor(mutation)));
      }

      if (error) {
        if (error.code === "42501") {
          console.warn(
            `Dropping unrecoverable ${mutation.table} ${mutation.op} mutation (RLS denied): ${error.message}`,
          );
          if (mutation.id !== undefined) await db.mutations.delete(mutation.id);
          continue;
        }
        throw syncFailure(`${mutation.table} ${mutation.op} failed: ${error.message}`, error.code);
      }
      if (mutation.id !== undefined) await db.mutations.delete(mutation.id);
    }
  }
}

// Mirrors this user's household memberships (and the households themselves)
// into the local db so household scoping works offline. Small tables — pulled
// whole every cycle, no watermark. Returns the household ids to scope the
// financial-table pulls by.
// Postgres "undefined table" / PostgREST "table not in schema cache" — the
// households migration hasn't been applied yet. The caller falls back to
// legacy user_id scoping so the app keeps working until it is.
function isMissingRelation(code: string | undefined) {
  return code === "42P01" || code === "PGRST205" || code === "PGRST204";
}

export async function pullHouseholds(userId: string): Promise<string[]> {
  const { data: memberRows, error: mErr } = await supabase
    .from("household_members")
    .select("*")
    .eq("user_id", userId);
  if (mErr) {
    if (isMissingRelation(mErr.code)) return [];
    throw syncFailure(`household_members pull failed: ${mErr.message}`, mErr.code);
  }

  const members = memberRows ?? [];
  const ids = [...new Set(members.map((m) => m.household_id as string))];

  let households: unknown[] = [];
  if (ids.length > 0) {
    const { data: hhRows, error: hErr } = await supabase
      .from("households")
      .select("*")
      .in("id", ids);
    if (hErr) throw syncFailure(`households pull failed: ${hErr.message}`, hErr.code);
    households = hhRows ?? [];
  }

  // Replace the local mirror of *my* rows wholesale — the only way to notice a
  // membership was revoked server-side. Do it in ONE transaction so liveQuery
  // observers (useHousehold) never see the empty gap between the delete and the
  // repopulate: that transient state nulls householdId and, once a household
  // scope is set, trips the provider's scope-reset guard into wiping local data
  // and reloading on every sync cycle.
  await db.transaction("rw", db.household_members, db.households, async () => {
    await db.household_members.where("user_id").equals(userId).delete();
    if (members.length > 0) await db.household_members.bulkPut(members);
    // @ts-expect-error -- rows match the households table shape
    if (households.length > 0) await db.households.bulkPut(households);
  });

  return ids;
}

// Pulls rows changed since the last successful pull for this table. The
// query window is captured before the request goes out (not read back from
// Supabase), so it stays correct even though it relies on the client clock.
// Scoped to the user's household(s); also sweeps up any of the user's own
// rows that never got a household_id (created offline before their household
// existed). With no household yet, falls back to plain user_id scope.
async function pullTable(table: SyncTable, userId: string, householdIds: string[]) {
  const meta = await db.syncMeta.get(table);
  const since = meta?.lastSyncedAt ?? EPOCH;
  const queryStartedAt = new Date().toISOString();

  const scope =
    householdIds.length > 0
      ? `household_id.in.(${householdIds.join(",")}),and(household_id.is.null,user_id.eq.${userId})`
      : `user_id.eq.${userId}`;

  const { data, error } = await supabase
    .from(table)
    .select("*")
    .or(scope)
    .gt("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(5000);

  if (error) throw syncFailure(`${table} pull failed: ${error.message}`, error.code);

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
  const remembered = readLastSuccessfulSync(userId);
  if (remembered && state.lastSyncedAt !== remembered) setState({ lastSyncedAt: remembered });
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
  setState({ status: "syncing", lastError: null, retryCount: 0 });

  try {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= MAX_SYNC_RETRIES; attempt += 1) {
      try {
        await pushMutations();
        const householdIds = await pullHouseholds(userId);
        for (const table of TABLES) await pullTable(table, userId, householdIds);
        await refreshPendingCount();
        const syncedAt = new Date().toISOString();
        writeLastSuccessfulSync(userId, syncedAt);
        setState({ status: "idle", lastSyncedAt: syncedAt, lastError: null, retryCount: 0 });
        return;
      } catch (err) {
        lastError = err;
        if (attempt >= MAX_SYNC_RETRIES || !isRetryableSyncError(err)) break;
        const retryCount = attempt + 1;
        setState({
          status: "syncing",
          retryCount,
          lastError: err instanceof Error ? err.message : String(err),
        });
        await wait(RETRY_DELAYS_MS[attempt]);
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          setState({ status: "offline", retryCount });
          return;
        }
      }
    }
    await refreshPendingCount();
    setState({
      status: "error",
      retryCount: MAX_SYNC_RETRIES,
      lastError: lastError instanceof Error ? lastError.message : String(lastError),
    });
  } finally {
    syncing = false;
  }
}

export async function enqueueMutation(mutation: Omit<import("./types").Mutation, "id" | "createdAt">) {
  await db.mutations.add({ ...mutation, createdAt: new Date().toISOString() });
  await refreshPendingCount();
}

// Back to a clean slate: used when the signed-in user changes or signs out.
function resetSyncState() {
  syncing = false;
  state = { status: "idle", pendingCount: 0, lastSyncedAt: null, lastError: null, retryCount: 0 };
  listeners.forEach((cb) => cb(state));
}

// Wipes every local table — synced data, the pending mutation queue, the
// per-table pull watermarks, and recorded conflicts — so no trace of one
// account survives into the next on a shared device. The next sign-in pulls
// everything fresh (syncMeta is cleared, so from the epoch).
export async function resetLocalData() {
  await Promise.all(db.tables.map((table) => table.clear()));
  resetSyncState();
}
