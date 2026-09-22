import { addMonths } from "@/lib/format";
import { daysInMonth } from "@/lib/date";
import type { GroceryPurchase, Transaction } from "@/lib/types";

const AVERAGE_MONTHS = 3;
const AVERAGE_DAYS_PER_MONTH = 365.25 / 12;

export interface DailyAllowance {
  remaining: number;
  daysRemaining: number;
  amountPerDay: number;
}

export interface LoanPayoffEstimate {
  months: number;
  projectedMonth: string;
}

export interface SavingsMonthlyRequirement {
  remaining: number;
  monthsRemaining: number;
  amountPerMonth: number;
}

export interface SpendingRunway {
  averageMonthlySpending: number;
  monthsAveraged: number;
  liquidBalance: number;
  runwayMonths: number | null;
}

export interface GroceryPriceChange {
  previousPrice: number;
  latestPrice: number;
  amountChange: number;
  percentChange: number | null;
}

function daysBetween(fromDate: string, toDate: string): number {
  const [fromYear, fromMonth, fromDay] = fromDate.split("-").map(Number);
  const [toYear, toMonth, toDay] = toDate.split("-").map(Number);
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      86_400_000,
  );
}

/** Remaining category funds divided across today and every remaining day this month. */
export function computeDailyAllowance(available: number, spent: number, today: string): DailyAllowance {
  const remaining = Math.max(0, available - spent);
  const day = Number(today.slice(8, 10));
  const daysRemaining = Math.max(1, daysInMonth(today.slice(0, 7)) - day + 1);
  return { remaining, daysRemaining, amountPerDay: remaining / daysRemaining };
}

/** Assumes one fixed payment per month, beginning with the next payment cycle. */
export function computeLoanPayoffEstimate(
  remaining: number,
  monthlyPayment: number,
  today: string,
): LoanPayoffEstimate | null {
  if (!Number.isFinite(remaining) || !Number.isFinite(monthlyPayment) || remaining <= 0 || monthlyPayment <= 0) {
    return null;
  }
  const months = Math.ceil(remaining / monthlyPayment);
  return {
    months,
    projectedMonth: addMonths(`${today.slice(0, 7)}-01`, months).slice(0, 7),
  };
}

/** Assumes equal monthly contributions with no interest or investment growth. */
export function computeSavingsMonthlyRequirement(
  target: number,
  contributed: number,
  targetDate: string | null | undefined,
  today: string,
): SavingsMonthlyRequirement | null {
  if (!targetDate || target <= contributed) return null;
  const remaining = Math.max(0, target - contributed);
  const daysRemaining = daysBetween(today, targetDate);
  const monthsRemaining = daysRemaining > 0 ? Math.max(1, Math.ceil(daysRemaining / AVERAGE_DAYS_PER_MONTH)) : 0;
  return {
    remaining,
    monthsRemaining,
    amountPerMonth: monthsRemaining > 0 ? remaining / monthsRemaining : remaining,
  };
}

/**
 * Uses the three complete calendar months before `today`, including months
 * with no expenses, then divides liquid funds by that average burn rate.
 */
export function computeSpendingRunway(
  transactions: Transaction[],
  liquidBalance: number,
  today: string,
): SpendingRunway {
  const currentMonth = `${today.slice(0, 7)}-01`;
  const monthKeys = Array.from({ length: AVERAGE_MONTHS }, (_, index) =>
    addMonths(currentMonth, -(index + 1)).slice(0, 7),
  );
  const eligibleMonths = new Set(monthKeys);
  const totalSpending = transactions.reduce((sum, transaction) => {
    if (
      transaction.deleted_at ||
      transaction.type !== "expense" ||
      !eligibleMonths.has(transaction.occurred_at.slice(0, 7))
    ) {
      return sum;
    }
    return sum + transaction.amount;
  }, 0);
  const averageMonthlySpending = totalSpending / AVERAGE_MONTHS;
  const safeLiquidBalance = Math.max(0, liquidBalance);
  return {
    averageMonthlySpending,
    monthsAveraged: AVERAGE_MONTHS,
    liquidBalance: safeLiquidBalance,
    runwayMonths: averageMonthlySpending > 0 ? safeLiquidBalance / averageMonthlySpending : null,
  };
}

/** Compares the two newest purchase prices for one grocery item. */
export function computeGroceryPriceChange(
  purchases: GroceryPurchase[],
): GroceryPriceChange | null {
  const sorted = purchases
    .filter((purchase) => !purchase.deleted_at && Number.isFinite(purchase.price))
    .sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
  if (sorted.length < 2) return null;

  const latestPrice = sorted[0].price;
  const previousPrice = sorted[1].price;
  const amountChange = latestPrice - previousPrice;
  return {
    previousPrice,
    latestPrice,
    amountChange,
    percentChange: previousPrice > 0 ? (amountChange / previousPrice) * 100 : null,
  };
}
