import { addDays } from "./date";
import type { Transaction } from "./types";

export const FORECAST_HORIZON_DAYS = 30;
const TREND_WINDOW_DAYS = 30;

export interface AccountForecast {
  avgDailyNet: number;
  projectedBalance: number;
  // First date within the horizon the balance is projected to cross below
  // zero, or null if it isn't (or is already negative — that's already
  // surfaced by the existing balance display, not new information).
  lowBalanceDate: string | null;
}

type ForecastTransaction = Pick<
  Transaction,
  "account_id" | "to_account_id" | "type" | "amount" | "occurred_at" | "deleted_at"
>;

// Projects an account's balance forward from its trailing daily net cash
// flow. Deliberately doesn't layer known future recurring/loan amounts on
// top of the trend — transactions generated from a recurring rule are
// indistinguishable from manual ones (no back-reference), so the trend
// already reflects historical recurring cash flow. Adding known future
// occurrences on top would double-count them.
export function computeAccountForecast(
  accountId: string,
  currentBalance: number,
  transactions: ForecastTransaction[],
  today: string,
  horizonDays = FORECAST_HORIZON_DAYS,
): AccountForecast {
  const windowStart = addDays(today, -TREND_WINDOW_DAYS);

  let net = 0;
  for (const t of transactions) {
    // occurred_at is stored as a full ISO datetime, not a plain date — slice
    // to just the date portion before comparing against "YYYY-MM-DD" bounds.
    const occurredDate = t.occurred_at.slice(0, 10);
    if (t.deleted_at || occurredDate < windowStart || occurredDate > today) continue;
    if (t.type === "transfer") {
      if (t.account_id === accountId) net -= t.amount;
      if (t.to_account_id === accountId) net += t.amount;
      continue;
    }
    if (t.account_id !== accountId) continue;
    net += t.type === "income" ? t.amount : -t.amount;
  }

  const avgDailyNet = net / TREND_WINDOW_DAYS;
  const projectedBalance = currentBalance + avgDailyNet * horizonDays;

  let lowBalanceDate: string | null = null;
  if (currentBalance > 0 && avgDailyNet < 0) {
    const daysToZero = Math.ceil(currentBalance / -avgDailyNet);
    if (daysToZero <= horizonDays) lowBalanceDate = addDays(today, daysToZero);
  }

  return { avgDailyNet, projectedBalance, lowBalanceDate };
}
