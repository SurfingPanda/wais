import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { extractReceipt, ScanReceiptError } from "@/lib/gemini";

// Turns a receipt photo into structured line items via Gemini. The client
// (GroceryReceiptDialog) sends a base64 image; the response pre-fills the
// dialog for the user to review before anything is logged.
//
// Gated on a valid Supabase session so this can't be used as an open,
// unauthenticated proxy to the owner's Gemini key/quota.

export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // ~8 MB decoded — the client downscales first
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Server auth is not configured" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const auth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await auth.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Session is invalid or expired" }, { status: 401 });
  }

  let body: { image?: unknown; mimeType?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";

  if (!image) {
    return NextResponse.json({ error: "Missing image data" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
  }
  // base64 decodes to ~3/4 of its length.
  if (image.length * 0.75 > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  try {
    const receipt = await extractReceipt(image, mimeType);
    return NextResponse.json(receipt);
  } catch (err) {
    if (err instanceof ScanReceiptError) {
      // `detail` (server-only) carries the raw Gemini status/body; the client
      // gets the plain-language `message` and a machine-readable `code`.
      console.error(`[scan-receipt] ${err.code}: ${err.detail ?? err.message}`);
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    }
    console.error("[scan-receipt] unexpected error", err);
    return NextResponse.json(
      { error: "Something went wrong while scanning — please try again.", code: "unknown" },
      { status: 500 },
    );
  }
}
