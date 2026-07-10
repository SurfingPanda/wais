export function formatCurrency(amount: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(amount);
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
