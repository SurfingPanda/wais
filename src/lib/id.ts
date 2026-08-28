// Deterministic, RFC-4122 v5-style UUID derived from a string key (SHA-1 of
// the key, with the version/variant bits fixed). Same key in → same UUID out.
//
// Used where an idempotent generator must be safe to run more than once
// concurrently (see generateDueTransactions): giving each generated row a
// key-derived id means a second run upserts the same row instead of
// inserting a duplicate.
export async function deterministicUuid(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(key));
  const b = new Uint8Array(digest).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC-4122 variant
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
