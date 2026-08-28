// The adjustment an account reconciliation would book: the rounded gap
// between the balance Wais computes and the real statement balance, which
// direction it moves the balance, and its (positive) amount — or null when
// the two already agree to the cent.
export function reconciliationAdjustment(currentBalance: number, statementBalance: number) {
  const diff = Math.round((statementBalance - currentBalance) * 100) / 100;
  if (diff === 0) return null;
  return {
    diff,
    type: (diff > 0 ? "income" : "expense") as "income" | "expense",
    amount: Math.abs(diff),
  };
}
