import type { Account, AccountType, Transaction } from "./types";

/** The signed balance change for one account from one transaction. */
export function accountTransactionDeltaForType(
  accountId: string,
  accountType: AccountType,
  transaction: Transaction,
) {
  if (transaction.type === "transfer") {
    if (transaction.account_id === accountId) {
      return accountType === "credit_card" ? transaction.amount : -transaction.amount;
    }
    if (transaction.to_account_id === accountId) {
      return accountType === "credit_card" ? -transaction.amount : transaction.amount;
    }
    return 0;
  }

  if (transaction.account_id !== accountId) return 0;
  const moneyIn = transaction.type === "income";
  return accountType === "credit_card"
    ? moneyIn
      ? -transaction.amount
      : transaction.amount
    : moneyIn
      ? transaction.amount
      : -transaction.amount;
}

export function accountTransactionDelta(account: Account, transaction: Transaction) {
  return accountTransactionDeltaForType(account.id, account.type, transaction);
}

export function accountBalance(account: Account, transactions: Transaction[]) {
  return (
    account.starting_balance +
    transactions.reduce((balance, transaction) => balance + accountTransactionDelta(account, transaction), 0)
  );
}

export function accountTransactionLabel(
  transaction: Transaction,
  accountsById: Map<string, Account>,
  accountId?: string,
) {
  if (transaction.is_adjustment) return "Reconciliation adjustment";
  if (transaction.type === "transfer") {
    if (accountId && transaction.to_account_id === accountId) {
      const source = transaction.account_id ? accountsById.get(transaction.account_id)?.name : null;
      return `Transfer from ${source ?? "another account"}`;
    }
    const destination = transaction.to_account_id
      ? accountsById.get(transaction.to_account_id)?.name
      : "another account";
    return `Transfer to ${destination ?? "another account"}`;
  }
  if (transaction.is_refund) return "Refund";
  if (transaction.loan_id) return "Loan payment";
  if (transaction.goal_id) return "Savings contribution";
  if (transaction.grocery_item_id) return "Grocery purchase";
  return transaction.type === "income" ? "Income" : "Expense";
}
