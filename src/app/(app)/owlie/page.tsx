"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { RotateCcw, Send } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { useHousehold } from "@/lib/household-provider";
import { belongsToHousehold } from "@/lib/household";
import { useCurrency } from "@/lib/currency";
import { todayLocalDate } from "@/lib/format";
import { ChatRequestError, sendChatMessage } from "@/lib/ai/chat-session";
import { parseChatContent } from "@/lib/ai/chat-format";
import { buildTargetedTransactionContext } from "@/lib/ai/transaction-retrieval";
import { getFollowUpSuggestions } from "@/lib/ai/follow-up-suggestions";
import { buildFinancialContext } from "@/lib/ai/chat-context";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const GREETING = "Hi, I'm Owlie. Ask me anything about your budgets, spending, or savings goals this month.";
const INITIAL_MESSAGES: ChatMessage[] = [{ role: "assistant", text: GREETING }];

export default function OwliePage() {
  const { user, session } = useAuth();
  const { householdId } = useHousehold();
  const { currency } = useCurrency();

  const categories = useLiveQuery(
    () =>
      user ? db.categories.filter((c) => !c.deleted_at && belongsToHousehold(c, user.id, householdId)).toArray() : [],
    [user?.id, householdId],
  );
  const budgets = useLiveQuery(
    () => (user ? db.budgets.filter((b) => !b.deleted_at && belongsToHousehold(b, user.id, householdId)).toArray() : []),
    [user?.id, householdId],
  );
  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions.filter((t) => !t.deleted_at && belongsToHousehold(t, user.id, householdId)).toArray()
        : [],
    [user?.id, householdId],
  );
  const goals = useLiveQuery(
    () =>
      user
        ? db.savings_goals.filter((g) => !g.deleted_at && belongsToHousehold(g, user.id, householdId)).toArray()
        : [],
    [user?.id, householdId],
  );
  const accounts = useLiveQuery(
    () =>
      user
        ? db.accounts.filter((account) => !account.deleted_at && belongsToHousehold(account, user.id, householdId)).toArray()
        : [],
    [user?.id, householdId],
  );
  const loans = useLiveQuery(
    () =>
      user
        ? db.loans.filter((loan) => !loan.deleted_at && belongsToHousehold(loan, user.id, householdId)).toArray()
        : [],
    [user?.id, householdId],
  );
  const recurringTransactions = useLiveQuery(
    () =>
      user
        ? db.recurring_transactions
            .filter((rule) => !rule.deleted_at && belongsToHousehold(rule, user.id, householdId))
            .toArray()
        : [],
    [user?.id, householdId],
  );
  const groceryItems = useLiveQuery(
    () =>
      user
        ? db.grocery_items.filter((item) => !item.deleted_at && belongsToHousehold(item, user.id, householdId)).toArray()
        : [],
    [user?.id, householdId],
  );
  const groceryPurchases = useLiveQuery(
    () =>
      user
        ? db.grocery_purchases
            .filter((purchase) => !purchase.deleted_at && belongsToHousehold(purchase, user.id, householdId))
            .toArray()
        : [],
    [user?.id, householdId],
  );

  const dataLoaded =
    categories !== undefined &&
    budgets !== undefined &&
    transactions !== undefined &&
    goals !== undefined &&
    accounts !== undefined &&
    loans !== undefined &&
    recurringTransactions !== undefined &&
    groceryItems !== undefined &&
    groceryPurchases !== undefined;
  const context = useMemo(() => {
    if (!dataLoaded) return "";
    return buildFinancialContext(
      {
        accounts,
        budgets,
        categories,
        groceryItems,
        groceryPurchases,
        goals,
        loans,
        recurringTransactions,
        transactions,
      },
      currency,
      todayLocalDate(),
    );
  }, [
    accounts,
    budgets,
    categories,
    currency,
    dataLoaded,
    goals,
    groceryItems,
    groceryPurchases,
    loans,
    recurringTransactions,
    transactions,
  ]);

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const suggestedFollowUps = useMemo(() => {
    const latestMessage = messages.at(-1);
    const latestQuestion = [...messages].reverse().find((message) => message.role === "user")?.text;
    if (pending || !latestQuestion || latestMessage?.role !== "assistant" || latestMessage.error) return [];

    return getFollowUpSuggestions({
      question: latestQuestion,
      hasAccounts: (accounts?.length ?? 0) > 0,
      hasBudgets: (budgets?.length ?? 0) > 0,
      hasGoals: (goals?.length ?? 0) > 0,
      hasGroceries: (groceryItems?.length ?? 0) > 0,
      hasLoans: (loans?.length ?? 0) > 0,
      hasTransactions: (transactions?.length ?? 0) > 0,
    });
  }, [accounts, budgets, goals, groceryItems, loans, messages, pending, transactions]);

  async function sendMessage(rawText: string) {
    const text = rawText.trim();
    const accessToken = session?.access_token;
    if (!text || !context || !accessToken || pending) return;

    const userMessage: ChatMessage = { role: "user", text };
    const nextMessages = [...messages, userMessage];
    setInput("");
    setMessages(nextMessages);
    setPending(true);

    try {
      const history = nextMessages
        .filter((message) => !message.error)
        .map(({ role, text: content }) => ({ role, content }))
        .slice(-20);
      const retrievalQuestion = nextMessages
        .filter((message) => message.role === "user")
        .slice(-3)
        .map((message) => message.text)
        .join("\n");
      const targetedTransactions = buildTargetedTransactionContext(
        retrievalQuestion,
        {
          accounts: accounts ?? [],
          categories: categories ?? [],
          transactions: transactions ?? [],
        },
        currency,
        todayLocalDate(),
      );
      const requestContext = targetedTransactions
        ? `${context}\n\n${targetedTransactions}`
        : context;
      const reply = await sendChatMessage(requestContext, history, accessToken);
      setMessages((previous) => [...previous, { role: "assistant", text: reply }]);
    } catch (error) {
      const message =
        error instanceof ChatRequestError
          ? error.message
          : "Owlie couldn’t respond just now — please try again.";
      setMessages((previous) => [
        ...previous,
        { role: "assistant", text: message, error: true },
      ]);
    } finally {
      setPending(false);
    }
  }

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await sendMessage(input);
  }

  function handleNewChat() {
    setMessages(INITIAL_MESSAGES);
    setInput("");
  }

  if (!dataLoaded) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <section
      aria-label="Ask Owlie chat"
      className="flex h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] min-h-[28rem] flex-col overflow-hidden rounded-2xl border bg-card shadow-sm md:h-[calc(100dvh-7.5rem)] md:max-h-[46rem]"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b bg-card px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-600/10 dark:bg-emerald-950/40">
            <Image
              src="/mascot-owl.png"
              alt=""
              width={856}
              height={712}
              className="h-9 w-auto object-contain drop-shadow-sm"
            />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold">Owlie</h1>
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
            </div>
            <p className="truncate text-xs text-muted-foreground">Your personal finance assistant</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={handleNewChat}
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">New chat</span>
          <span className="sr-only sm:hidden">New chat</span>
        </Button>
      </header>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-busy={pending}
        className="flex flex-1 flex-col gap-4 overflow-y-auto bg-muted/20 px-3 py-5 sm:px-5"
      >
        {messages.map((message, index) => {
          if (message.role === "user") {
            return (
              <div key={index} className="flex justify-end pl-10">
                <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-emerald-600 px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm dark:bg-emerald-500 dark:text-emerald-950">
                  {message.text}
                </p>
              </div>
            );
          }

          return (
            <div key={index} className="flex items-end gap-2.5 pr-6 sm:pr-12">
              <Image
                src="/mascot-owl.png"
                alt=""
                width={856}
                height={712}
                className="mb-0.5 h-8 w-auto shrink-0 object-contain drop-shadow-sm"
              />
              <div
                className={cn(
                  "max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md border bg-card px-3.5 py-2.5 text-sm leading-relaxed shadow-xs",
                  message.error &&
                    "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300",
                )}
              >
                <ChatMessageContent text={message.text} />
              </div>
            </div>
          );
        })}
        {pending && (
          <div className="flex items-end gap-2.5" aria-label="Owlie is typing">
            <Image
              src="/mascot-owl.png"
              alt=""
              width={856}
              height={712}
              className="mb-0.5 h-8 w-auto shrink-0 object-contain drop-shadow-sm"
            />
            <div
              className="flex h-10 items-center gap-1 rounded-2xl rounded-bl-md border bg-card px-4 shadow-xs"
              aria-hidden
            >
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
            </div>
          </div>
        )}
        {suggestedFollowUps.length > 0 && (
          <div className="ml-10 space-y-2" role="group" aria-label="Suggested follow-up questions">
            <p className="text-xs font-medium text-muted-foreground">Ask a follow-up</p>
            <div className="flex flex-wrap gap-2">
              {suggestedFollowUps.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-auto max-w-full rounded-full bg-card px-3 py-1.5 text-left whitespace-normal shadow-xs"
                  onClick={() => void sendMessage(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t bg-card p-3 sm:p-4">
        <form onSubmit={handleSend} className="relative">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={2_000}
            placeholder="Message Owlie..."
            aria-label="Message Owlie"
            autoComplete="off"
            disabled={pending || !session?.access_token}
            className="h-11 rounded-xl bg-muted/30 pr-12 text-base shadow-xs md:text-sm"
          />
          <Button
            type="submit"
            size="icon"
            className="absolute top-1.5 right-1.5 size-8 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
            disabled={pending || !session?.access_token || !input.trim()}
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        </form>
        <p className="mt-2 hidden text-center text-[11px] text-muted-foreground sm:block">
          Owlie uses your current Wais data and may make mistakes. Check important financial decisions.
        </p>
      </footer>
    </section>
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

function ChatMessageContent({ text }: { text: string }) {
  const blocks = parseChatContent(text);

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h2 key={index} className="pt-0.5 text-sm font-semibold text-foreground first:pt-0">
              {renderInlineMarkdown(block.text)}
            </h2>
          );
        }
        if (block.type === "calculation") {
          return (
            <p key={index} className="rounded-lg bg-muted px-2.5 py-2 font-mono text-xs text-foreground">
              {renderInlineMarkdown(block.text)}
            </p>
          );
        }
        if (block.type === "unordered-list" || block.type === "ordered-list") {
          const List = block.type === "unordered-list" ? "ul" : "ol";
          return (
            <List
              key={index}
              className={cn(
                "space-y-1 pl-5 marker:text-muted-foreground",
                block.type === "unordered-list" ? "list-disc" : "list-decimal",
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </List>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}
