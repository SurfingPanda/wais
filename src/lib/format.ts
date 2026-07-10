export function formatCurrency(amount: number, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
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
