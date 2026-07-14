// Pure UTC date arithmetic on "YYYY-MM-DD" / "YYYY-MM" strings, so date math
// never depends on the runtime's local timezone. Parsing a date as local
// time and formatting it back with toISOString (always UTC) silently
// shifts the result by a day in any timezone ahead of UTC.
export function addDays(date: string, delta: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

export function daysInMonth(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function weekdayOf(date: string) {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
