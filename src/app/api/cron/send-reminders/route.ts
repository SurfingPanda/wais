import { NextResponse } from "next/server";
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLoanDueInfo } from "@/lib/loans";
import { getNextOccurrence } from "@/lib/recurrence";
import { addDays } from "@/lib/date";
import { currentMonth } from "@/lib/format";
import type { Loan, RecurringTransaction } from "@/lib/types";

interface PushSubscriptionRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

interface Notice {
  userId: string;
  title: string;
  body: string;
  url: string;
}

// Runs once daily via Vercel Cron (see vercel.ts). Checks every loan/
// recurring transaction with a reminder configured, and sends a Web Push
// notification to each of the owning user's subscribed devices for anything
// due exactly `reminder_days_before` days from now.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vapidSubject = process.env.VAPID_SUBJECT;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  if (!vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return NextResponse.json({ error: "Missing VAPID env vars" }, { status: 500 });
  }
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const [loansResult, recurringResult, paymentsResult, subscriptionsResult] = await Promise.all([
    supabaseAdmin
      .from("loans")
      .select("*")
      .is("deleted_at", null)
      .not("reminder_days_before", "is", null),
    supabaseAdmin
      .from("recurring_transactions")
      .select("*")
      .is("deleted_at", null)
      .not("reminder_days_before", "is", null),
    supabaseAdmin
      .from("transactions")
      .select("loan_id, amount, occurred_at")
      .is("deleted_at", null)
      .not("loan_id", "is", null),
    supabaseAdmin.from("push_subscriptions").select("*"),
  ]);

  const loans = (loansResult.data ?? []) as Loan[];
  const recurringRules = (recurringResult.data ?? []) as RecurringTransaction[];
  const payments = (paymentsResult.data ?? []) as { loan_id: string; amount: number; occurred_at: string }[];
  const subscriptions = (subscriptionsResult.data ?? []) as PushSubscriptionRow[];

  const subsByUser = new Map<string, PushSubscriptionRow[]>();
  for (const sub of subscriptions) {
    const list = subsByUser.get(sub.user_id) ?? [];
    list.push(sub);
    subsByUser.set(sub.user_id, list);
  }

  // Same "paid for this cycle" logic as src/app/(app)/loans/page.tsx, so a
  // loan already paid off/paid this month doesn't get a reminder.
  const thisMonthKey = currentMonth().slice(0, 7);
  const paidByLoan = new Map<string, number>();
  const paidThisMonthLoanIds = new Set<string>();
  for (const p of payments) {
    paidByLoan.set(p.loan_id, (paidByLoan.get(p.loan_id) ?? 0) + p.amount);
    if (p.occurred_at.slice(0, 7) === thisMonthKey) paidThisMonthLoanIds.add(p.loan_id);
  }

  const notices: Notice[] = [];

  for (const loan of loans) {
    if (loan.reminder_days_before == null) continue;
    const paid = paidByLoan.get(loan.id) ?? 0;
    const paidOff = loan.principal - paid <= 0;
    const cyclePaid = paidOff || (loan.payment_type === "recurring" && paidThisMonthLoanIds.has(loan.id));
    const dueInfo = getLoanDueInfo(loan, cyclePaid, now);
    if (!dueInfo?.date) continue;
    if (addDays(dueInfo.date, -loan.reminder_days_before) !== today) continue;

    notices.push({
      userId: loan.user_id,
      title: "Loan due soon",
      body: `${loan.name} is due ${dueInfo.date === today ? "today" : `on ${dueInfo.date}`}.`,
      url: "/loans",
    });
  }

  for (const rule of recurringRules) {
    if (rule.reminder_days_before == null) continue;
    const next = getNextOccurrence(rule);
    if (!next) continue;
    if (addDays(next, -rule.reminder_days_before) !== today) continue;

    notices.push({
      userId: rule.user_id,
      title: "Upcoming recurring transaction",
      body: `${rule.description || "A recurring transaction"} is due ${next === today ? "today" : `on ${next}`}.`,
      url: "/recurring",
    });
  }

  let sent = 0;
  await Promise.all(
    notices.map(async (notice) => {
      const subs = subsByUser.get(notice.userId) ?? [];
      await Promise.all(
        subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: notice.title, body: notice.body, url: notice.url }),
            );
            sent++;
          } catch (err) {
            const statusCode = (err as { statusCode?: number }).statusCode;
            if (statusCode === 404 || statusCode === 410) {
              await supabaseAdmin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
            }
          }
        }),
      );
    }),
  );

  return NextResponse.json({ notices: notices.length, sent });
}
