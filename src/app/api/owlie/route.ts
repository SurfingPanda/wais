import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { completeOwlieChat, GroqChatError, type GroqChatMessage } from "@/lib/groq";

export const maxDuration = 30;

// The context builder caps record counts per domain, but a fully populated
// household can still produce a sizeable snapshot once names and currency
// values are included. This remains well below the model context window.
const MAX_CONTEXT_LENGTH = 48_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_MESSAGES = 20;
const MAX_TOTAL_MESSAGE_LENGTH = 20_000;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Server auth is not configured" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const auth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await auth.auth.getUser(token);
  if (authError || !userData.user) {
    return NextResponse.json({ error: "Session is invalid or expired" }, { status: 401 });
  }

  let body: { context?: unknown; messages?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const context = typeof body.context === "string" ? body.context.trim() : "";
  if (!context || context.length > MAX_CONTEXT_LENGTH) {
    return NextResponse.json({ error: "Invalid financial context" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "Invalid chat history" }, { status: 400 });
  }

  const messages: GroqChatMessage[] = [];
  let totalLength = 0;
  for (const raw of body.messages) {
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Invalid chat message" }, { status: 400 });
    }
    const entry = raw as Record<string, unknown>;
    const role = entry.role;
    const content = typeof entry.content === "string" ? entry.content.trim() : "";
    if ((role !== "user" && role !== "assistant") || !content || content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "Invalid chat message" }, { status: 400 });
    }
    totalLength += content.length;
    messages.push({ role, content });
  }

  if (totalLength > MAX_TOTAL_MESSAGE_LENGTH || messages.at(-1)?.role !== "user") {
    return NextResponse.json({ error: "Invalid chat history" }, { status: 400 });
  }

  try {
    const reply = await completeOwlieChat(context, messages);
    return NextResponse.json({ reply });
  } catch (error) {
    if (error instanceof GroqChatError) {
      console.error(`[owlie] ${error.code}: ${error.detail ?? error.message}`);
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("[owlie] unexpected error", error);
    return NextResponse.json(
      { error: "Owlie couldn’t respond just now — please try again.", code: "unknown" },
      { status: 500 },
    );
  }
}
