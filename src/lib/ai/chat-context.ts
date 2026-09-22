import { accountBalance, accountTransactionLabel } from "@/lib/account-ledger";
import { computeCategoryBudgetHealth, type CategoryBudgetHealth } from "@/lib/budget-health";
import { formatCurrency, monthLabel } from "@/lib/format";
import { computeGoalHealth } from "@/lib/goal-health";
import { computeRestockInfo } from "@/lib/grocery-restock";
import { getLoanDueInfo } from "@/lib/loans";
import { getNextOccurrence } from "@/lib/recurrence";
import type {
  Account,
  Budget,
  Category,
  GroceryItem,
  GroceryPurchase,
  Loan,
  RecurringTransaction,
  SavingsGoal,
  Transaction,
} from "@/lib/types";

const MAX_CATEGORIES = 12;
const MAX_GOALS = 8;
const MAX_ACCOUNTS = 12;
const MAX_LOANS = 10;
const MAX_RECURRING = 12;
const MAX_GROCERIES = 15;
const MAX_RECENT_TRANSACTIONS = 40;
const TREND_MONTHS = 12;

export interface FinancialContextData {
  accounts: Account[];
  budgets: Budget[];
  categories: Category[];
  groceryItems: GroceryItem[];
  groceryPurchases: GroceryPurchase[];
  goals: SavingsGoal[];
  loans: Loan[];
  recurringTransactions: RecurringTransaction[];
  transactions: Transaction[];
}

function cleanText(value: string, maxLength = 80): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength - 1)}…`;
}

function monthKeysEndingAt(today: string, count: number): string[] {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const keys: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const total = year * 12 + (month - 1) - offset;
    const resultYear = Math.floor(total / 12);
    const resultMonth = (total % 12) + 1;
    keys.push(`${resultYear}-${String(resultMonth).padStart(2, "0")}`);
  }
  return keys;
}

function emptySection(label: string, value: string): string {
  return `${label}: ${value}.`;
}

/**
 * Builds a bounded, household-filtered snapshot for Owlie. Callers must pass
 * only rows already scoped with belongsToHousehold; this function then strips
 * deleted rows, summarizes long history, and caps detailed lists.
 */
export function buildFinancialContext(
  data: FinancialContextData,
  currency: string,
  today: string,
): string {
  const categories = data.categories.filter((row) => !row.deleted_at);
  const budgets = data.budgets.filter((row) => !row.deleted_at);
  const transactions = data.transactions.filter((row) => !row.deleted_at);
  const accounts = data.accounts.filter((row) => !row.deleted_at);
  const goals = data.goals.filter((row) => !row.deleted_at);
  const loans = data.loans.filter((row) => !row.deleted_at);
  const recurring = data.recurringTransactions.filter((row) => !row.deleted_at);
  const groceryItems = data.groceryItems.filter((row) => !row.deleted_at);
  const groceryPurchases = data.groceryPurchases.filter((row) => !row.deleted_at);

  const currentKey = today.slice(0, 7);
  const currentMonth = `${currentKey}-01`;
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  let currentIncome = 0;
  let currentExpense = 0;
  for (const transaction of transactions) {
    if (transaction.type === "transfer" || transaction.occurred_at.slice(0, 7) !== currentKey) continue;
    if (transaction.type === "income") currentIncome += transaction.amount;
    else currentExpense += transaction.amount;
  }

  const accountLines = accounts
    .map((account) => {
      const related = transactions.filter(
        (transaction) => transaction.account_id === account.id || transaction.to_account_id === account.id,
      );
      const balance = accountBalance(account, related);
      const lastActivity = related.reduce(
        (latest, transaction) => transaction.occurred_at > latest ? transaction.occurred_at : latest,
        "",
      );
      return {
        account,
        balance,
        line: `- ${cleanText(account.name)} (${account.type.replaceAll("_", " ")}): ${formatCurrency(balance, currency)}${lastActivity ? `; last activity ${lastActivity.slice(0, 10)}` : "; no transaction history"}`,
      };
    })
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  const netWorth = accountLines.reduce(
    (sum, entry) => sum + (entry.account.type === "credit_card" ? -entry.balance : entry.balance),
    0,
  );

  const budgetedThisMonth = new Set(
    budgets.filter((budget) => budget.month.slice(0, 7) === currentKey).map((budget) => budget.category_id),
  );
  const rolloverCategoryIds = new Set(categories.filter((category) => category.rollover).map((category) => category.id));
  const relevantCategoryIds = new Set([...budgetedThisMonth, ...rolloverCategoryIds]);
  const categoryLines = categories
    .filter((category) => relevantCategoryIds.has(category.id))
    .map((category) => ({
      name: category.name,
      health: computeCategoryBudgetHealth(category, currentKey, budgets, transactions, today),
    }))
    .filter(
      (entry): entry is { name: string; health: CategoryBudgetHealth } =>
        !(entry.health.available <= 0 && entry.health.spent === 0),
    )
    .sort((a, b) => b.health.pct - a.health.pct)
    .slice(0, MAX_CATEGORIES)
    .map(
      ({ name, health }) =>
        `- ${cleanText(name)}: ${formatCurrency(health.spent, currency)} spent of ${formatCurrency(health.available, currency)} available (${Math.round(health.pct)}%, ${health.status})`,
    );

  const goalLines = goals
    .map((goal) => {
      const contributed = transactions
        .filter((transaction) => transaction.goal_id === goal.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      return { goal, health: computeGoalHealth(goal, contributed, today) };
    })
    .sort((a, b) => (a.goal.target_date ?? "9999").localeCompare(b.goal.target_date ?? "9999"))
    .slice(0, MAX_GOALS)
    .map(
      ({ goal, health }) =>
        `- ${cleanText(goal.name)}: ${formatCurrency(health.contributed, currency)} saved of ${formatCurrency(health.target, currency)} target (${Math.round(health.pct)}%, ${health.status})${goal.target_date ? `; target ${goal.target_date}` : ""}`,
    );

  const paidThisMonthLoanIds = new Set(
    transactions
      .filter((transaction) => transaction.loan_id && transaction.occurred_at.slice(0, 7) === currentKey)
      .map((transaction) => transaction.loan_id as string),
  );
  const now = new Date(`${today}T12:00:00`);
  const loanLines = loans
    .map((loan) => {
      const paid = transactions
        .filter((transaction) => transaction.loan_id === loan.id)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
      const remaining = Math.max(0, loan.principal - paid);
      const paidForCycle = remaining <= 0 || (loan.payment_type === "recurring" && paidThisMonthLoanIds.has(loan.id));
      const due = getLoanDueInfo(loan, paidForCycle, now);
      const payment = loan.payment_type === "recurring"
        ? `${formatCurrency(loan.monthly_payment ?? 0, currency)} monthly`
        : "one-time";
      const account = loan.account_id ? accountsById.get(loan.account_id)?.name : null;
      return {
        remaining,
        line: `- ${cleanText(loan.name)}: ${formatCurrency(remaining, currency)} remaining of ${formatCurrency(loan.principal, currency)}; ${payment}${due ? `; ${due.status}${due.date ? ` on ${due.date}` : ""}` : "; no payment currently due"}${account ? `; pays from ${cleanText(account)}` : ""}`,
      };
    })
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, MAX_LOANS)
    .map((entry) => entry.line);

  const recurringLines = recurring
    .map((rule) => {
      const category = rule.category_id ? categoriesById.get(rule.category_id)?.name : null;
      const account = rule.account_id ? accountsById.get(rule.account_id)?.name : null;
      const next = getNextOccurrence(rule);
      return {
        next: next ?? "9999-99-99",
        line: `- ${cleanText(rule.description || "Untitled")}: ${rule.type} ${formatCurrency(rule.amount, currency)} ${rule.frequency}; next ${next ?? "none"}${category ? `; category ${cleanText(category)}` : ""}${account ? `; account ${cleanText(account)}` : ""}${rule.end_date ? `; ends ${rule.end_date}` : ""}`,
      };
    })
    .sort((a, b) => a.next.localeCompare(b.next))
    .slice(0, MAX_RECURRING)
    .map((entry) => entry.line);

  const purchasesByItem = new Map<string, GroceryPurchase[]>();
  for (const purchase of groceryPurchases) {
    const existing = purchasesByItem.get(purchase.grocery_item_id);
    if (existing) existing.push(purchase);
    else purchasesByItem.set(purchase.grocery_item_id, [purchase]);
  }
  const groceryLines = groceryItems
    .map((item) => ({
      item,
      info: computeRestockInfo(item, purchasesByItem.get(item.id) ?? [], today),
    }))
    .sort((a, b) => (a.info.daysUntilDue ?? Infinity) - (b.info.daysUntilDue ?? Infinity))
    .slice(0, MAX_GROCERIES)
    .map(({ item, info }) => {
      if (!info.lastPurchasedAt) return `- ${cleanText(item.name)}: no purchase history; ${info.status}`;
      return `- ${cleanText(item.name)}: ${info.status}; last bought ${info.lastPurchasedAt} for ${formatCurrency(info.lastPrice ?? 0, currency)}; ${info.purchaseCount} purchase(s); expected again ${info.nextExpectedAt}`;
    });

  const recentTransactionLines = [...transactions]
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_RECENT_TRANSACTIONS)
    .map((transaction) => {
      const category = transaction.category_id ? categoriesById.get(transaction.category_id)?.name : null;
      const source = transaction.account_id ? accountsById.get(transaction.account_id)?.name : null;
      const destination = transaction.to_account_id ? accountsById.get(transaction.to_account_id)?.name : null;
      const tags = [accountTransactionLabel(transaction, accountsById)];
      if (transaction.is_adjustment) tags.push("adjustment");
      if (transaction.is_refund) tags.push("refund");
      const accountText = transaction.type === "transfer"
        ? `${source ?? "unassigned"} to ${destination ?? "unassigned"}`
        : source ?? "unassigned";
      return `- ${transaction.occurred_at.slice(0, 10)} | ${transaction.type} | ${formatCurrency(transaction.amount, currency)} | ${cleanText(transaction.description || "Untitled")} | category ${cleanText(category ?? "uncategorized")} | account ${cleanText(accountText)} | ${tags.join(", ")}`;
    });

  const trendLines = monthKeysEndingAt(today, TREND_MONTHS).map((key) => {
    let income = 0;
    let expense = 0;
    let count = 0;
    for (const transaction of transactions) {
      if (transaction.type === "transfer" || transaction.occurred_at.slice(0, 7) !== key) continue;
      count += 1;
      if (transaction.type === "income") income += transaction.amount;
      else expense += transaction.amount;
    }
    return `- ${monthLabel(`${key}-01`)}: income ${formatCurrency(income, currency)}, expenses ${formatCurrency(expense, currency)}, net ${formatCurrency(income - expense, currency)}, ${count} transaction(s)`;
  });

  return [
    `Snapshot date: ${today}. Currency: ${currency}. Current month: ${monthLabel(currentMonth)}.`,
    `Current-month summary: income ${formatCurrency(currentIncome, currency)}, expenses ${formatCurrency(currentExpense, currency)}, net ${formatCurrency(currentIncome - currentExpense, currency)}.`,
    accountLines.length
      ? `Accounts (estimated net worth ${formatCurrency(netWorth, currency)}):\n${accountLines.slice(0, MAX_ACCOUNTS).map((entry) => entry.line).join("\n")}`
      : emptySection("Accounts", "none recorded"),
    categoryLines.length ? `Current budgets:\n${categoryLines.join("\n")}` : emptySection("Current budgets", "none set"),
    goalLines.length ? `Savings goals:\n${goalLines.join("\n")}` : emptySection("Savings goals", "none recorded"),
    loanLines.length ? `Loans and payment schedules:\n${loanLines.join("\n")}` : emptySection("Loans", "none recorded"),
    recurringLines.length ? `Recurring transactions:\n${recurringLines.join("\n")}` : emptySection("Recurring transactions", "none recorded"),
    groceryLines.length ? `Groceries and restock history:\n${groceryLines.join("\n")}` : emptySection("Groceries", "none recorded"),
    recentTransactionLines.length
      ? `Recent transaction details (newest ${recentTransactionLines.length} of ${transactions.length}):\n${recentTransactionLines.join("\n")}`
      : emptySection("Recent transactions", "none recorded"),
    `Monthly trends (last ${TREND_MONTHS} months):\n${trendLines.join("\n")}`,
    "Coverage note: detailed transactions and lists are capped to the newest or most relevant records above; monthly trend totals use all available household transactions.",
  ].join("\n\n");
}
