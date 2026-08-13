"use client";

import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Send } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { useCurrency } from "@/lib/currency";
import { todayLocalDate } from "@/lib/format";
import { getOnDeviceAvailability, type OnDeviceAvailability } from "@/lib/ai/on-device";
import { createChatSession, sendChatMessage } from "@/lib/ai/chat-session";
import { buildFinancialContext, type GoalContribution } from "@/lib/ai/chat-context";
import { OwlieTip } from "@/components/owlie";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const GREETING = "Hi, I'm Owlie. Ask me anything about your budgets, spending, or savings goals this month.";

export default function OwliePage() {
  const { user } = useAuth();
  const { currency } = useCurrency();

  const categories = useLiveQuery(
    () =>
      user ? db.categories.where("user_id").equals(user.id).filter((c) => !c.deleted_at).toArray() : [],
    [user?.id],
  );
  const budgets = useLiveQuery(
    () => (user ? db.budgets.where("user_id").equals(user.id).filter((b) => !b.deleted_at).toArray() : []),
    [user?.id],
  );
  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions.where("user_id").equals(user.id).filter((t) => !t.deleted_at).toArray()
        : [],
    [user?.id],
  );
  const goals = useLiveQuery(
    () =>
      user
        ? db.savings_goals.where("user_id").equals(user.id).filter((g) => !g.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const dataLoaded =
    categories !== undefined && budgets !== undefined && transactions !== undefined && goals !== undefined;

  const [availability, setAvailability] = useState<OnDeviceAvailability | "checking">("checking");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [epoch, setEpoch] = useState(0);

  const sessionRef = useRef<LanguageModelSession | null>(null);
  const createdEpochRef = useRef(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Live-query results change identity often; stash the latest in a ref so
  // the session-creation effect (below) can read current data without
  // re-running every time it changes — a session should only be (re)built
  // once per epoch, not continuously as the user's data updates.
  const dataRef = useRef({ categories, budgets, transactions, goals, currency });
  useEffect(() => {
    dataRef.current = { categories, budgets, transactions, goals, currency };
  });

  useEffect(() => {
    let cancelled = false;
    getOnDeviceAvailability().then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (availability !== "available" || !dataLoaded) return;
    if (createdEpochRef.current === epoch) return;
    createdEpochRef.current = epoch;

    let cancelled = false;
    const { categories, budgets, transactions, goals, currency } = dataRef.current;

    const contributedByGoal = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (!t.goal_id) continue;
      contributedByGoal.set(t.goal_id, (contributedByGoal.get(t.goal_id) ?? 0) + t.amount);
    }
    const goalInputs: GoalContribution[] = (goals ?? []).map((g) => ({
      goal: g,
      contributed: contributedByGoal.get(g.id) ?? 0,
    }));
    const context = buildFinancialContext(
      categories ?? [],
      budgets ?? [],
      transactions ?? [],
      goalInputs,
      currency,
      todayLocalDate(),
    );

    setSessionReady(false);
    createChatSession(context).then((session) => {
      if (cancelled) {
        session?.destroy();
        return;
      }
      sessionRef.current = session;
      setSessionReady(session !== null);
      setMessages(session ? [{ role: "assistant", text: GREETING }] : []);
    });

    return () => {
      cancelled = true;
    };
    // Deliberately gated by availability/dataLoaded/epoch only — a live-query
    // data refresh shouldn't tear down an in-progress conversation. "New
    // chat" (bumping epoch) is the only intended way to rebuild the session.
  }, [availability, dataLoaded, epoch]);

  useEffect(() => {
    return () => {
      sessionRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function handleSend() {
    const text = input.trim();
    const session = sessionRef.current;
    if (!text || !session || pending) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text }]);
    setPending(true);
    const reply = await sendChatMessage(session, text);
    setPending(false);
    setMessages((prev) => [
      ...prev,
      reply
        ? { role: "assistant", text: reply }
        : { role: "assistant", text: "Owlie couldn't respond just now — try again.", error: true },
    ]);
  }

  function handleNewChat() {
    sessionRef.current?.destroy();
    sessionRef.current = null;
    setSessionReady(false);
    setMessages([]);
    setEpoch((e) => e + 1);
  }

  if (availability === "checking" || !dataLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (availability !== "available") {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Ask Owlie</h1>
        <OwlieTip tone="neutral" size="md">
          Owlie&apos;s on-device AI isn&apos;t available in this browser yet. This feature needs a version
          of Chrome with on-device AI (Gemini Nano) support, which is still rolling out to most devices.
        </OwlieTip>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ask Owlie</h1>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleNewChat}>
          <RotateCcw className="size-3.5" /> New chat
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="flex max-h-[65vh] min-h-[50vh] flex-col gap-3 overflow-y-auto rounded-xl border p-3"
      >
        {messages.map((m, i) =>
          m.role === "assistant" ? (
            <OwlieTip key={i} tone={m.error ? "warning" : "neutral"} size="sm">
              {m.text}
            </OwlieTip>
          ) : (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] rounded-2xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">
                {m.text}
              </p>
            </div>
          ),
        )}
        {pending && (
          <OwlieTip tone="neutral" size="sm" loading>
            Owlie is typing…
          </OwlieTip>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ask about your budgets, spending, or goals..."
          disabled={pending || !sessionReady}
        />
        <Button size="icon" onClick={handleSend} disabled={pending || !sessionReady || !input.trim()} aria-label="Send">
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
