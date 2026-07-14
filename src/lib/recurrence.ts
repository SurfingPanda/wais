import { addDays, daysInMonth, weekdayOf } from "./date";
import type { RecurringTransaction } from "./types";

export type RecurrenceRule = Pick<
  RecurringTransaction,
  "frequency" | "day_of_month" | "weekday" | "start_date" | "end_date" | "last_generated_date"
>;

function addMonthsToMonthKey(monthKey: string, delta: number) {
  const [y, m] = monthKey.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}`;
}

// Clamped so e.g. day_of_month 31 lands on Feb 28/29 instead of rolling
// into March.
function monthlyOccurrence(monthKey: string, dayOfMonth: number) {
  const day = Math.min(dayOfMonth, daysInMonth(monthKey));
  return `${monthKey}-${String(day).padStart(2, "0")}`;
}

function firstOnOrAfterWeekday(date: string, weekday: number) {
  const diff = (weekday - weekdayOf(date) + 7) % 7;
  return addDays(date, diff);
}

// Every occurrence date that's come due and hasn't been generated yet,
// oldest first. Capped defensively — a rule created years ago shouldn't
// backfill thousands of transactions in one go.
export function getDueOccurrences(rule: RecurrenceRule, today: string, maxOccurrences = 366): string[] {
  const from = rule.last_generated_date ? addDays(rule.last_generated_date, 1) : rule.start_date;
  const cutoff = rule.end_date && rule.end_date < today ? rule.end_date : today;
  if (from > cutoff) return [];

  const dates: string[] = [];
  if (rule.frequency === "weekly") {
    let day = firstOnOrAfterWeekday(from, rule.weekday ?? 0);
    while (day <= cutoff && dates.length < maxOccurrences) {
      dates.push(day);
      day = addDays(day, 7);
    }
  } else {
    let monthKey = from.slice(0, 7);
    while (dates.length < maxOccurrences) {
      const occurrence = monthlyOccurrence(monthKey, rule.day_of_month ?? 1);
      if (occurrence > cutoff) break;
      if (occurrence >= from) dates.push(occurrence);
      monthKey = addMonthsToMonthKey(monthKey, 1);
    }
  }
  return dates;
}

// For display only — the next date a transaction will be generated for,
// whether or not it's already due. Null once that date would fall after
// the rule's end date.
export function getNextOccurrence(rule: RecurrenceRule): string | null {
  const from = rule.last_generated_date ? addDays(rule.last_generated_date, 1) : rule.start_date;

  let occurrence: string;
  if (rule.frequency === "weekly") {
    occurrence = firstOnOrAfterWeekday(from, rule.weekday ?? 0);
  } else {
    const monthKey = from.slice(0, 7);
    const candidate = monthlyOccurrence(monthKey, rule.day_of_month ?? 1);
    occurrence =
      candidate >= from ? candidate : monthlyOccurrence(addMonthsToMonthKey(monthKey, 1), rule.day_of_month ?? 1);
  }

  return rule.end_date && occurrence > rule.end_date ? null : occurrence;
}
