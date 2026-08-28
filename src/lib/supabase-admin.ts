import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Only ever imported from server-only
// code (Route Handlers), never from a "use client" file or shared lib that
// a client component could pull in.
//
// Created lazily on first use, not at module load: Next imports every route
// module during `next build` page-data collection, and a top-level throw here
// would fail the whole build (and any unrelated route) whenever the env vars
// aren't present locally. Callers that need it at request time get a clear
// error then instead.
let client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
  }

  client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
