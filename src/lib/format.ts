export function formatCurrency(amount: number, currency = "USD") {
  const value = Number.isFinite(amount) ? amount : 0;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    // Bad/empty currency code (e.g. corrupted stored preference) would
    // otherwise throw a RangeError and take the whole screen down. Fall back
    // to a plain grouped number with the raw code as a prefix.
    const num = new Intl.NumberFormat(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
    const code = typeof currency === "string" ? currency.trim() : "";
    return code ? `${code} ${num}` : num;
  }
}

export function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function monthLabel(month: string) {
  return new Date(`${month}T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function shortMonthLabel(month: string) {
  return new Date(`${month}T00:00:00`).toLocaleDateString(undefined, { month: "short" });
}

export function addMonths(month: string, delta: number) {
  const d = new Date(`${month}T00:00:00`);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function isSameOrAfterMonth(month: string, other: string) {
  return month >= other;
}

export function formatPercent(value: number, digits = 0) {
  return `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(digits)}%`;
}

export function todayLocalDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export function shortDateLabel(isoDate: string) {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
