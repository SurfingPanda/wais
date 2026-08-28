"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeftRight, MoreVertical, Scale, Search, X } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { deleteTransaction } from "@/lib/actions/transactions";
import { useCurrency } from "@/lib/currency";
import { formatCurrency, monthLabel } from "@/lib/format";
import type { Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  TransactionDialog,
  type CategoryOption,
  type AccountOption,
} from "@/components/transaction-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TransactionsPage() {
  const { user } = useAuth();

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at)
            .reverse()
            .sortBy("occurred_at")
        : [],
    [user?.id],
  );

  const categories = useLiveQuery(
    () =>
      user
        ? db.categories.where("user_id").equals(user.id).filter((c) => !c.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const accounts = useLiveQuery(
    () =>
      user
        ? db.accounts.where("user_id").equals(user.id).filter((a) => !a.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  const accountById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a])),
    [accounts],
  );

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [accountFilter, setAccountFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");

  // Months that actually have transactions, newest first — lets the month
  // filter jump straight to a specific month without a date-picker widget.
  const monthOptions = useMemo(() => {
    const months = new Set((transactions ?? []).map((t) => t.occurred_at.slice(0, 7)));
    return Array.from(months).sort((a, b) => (a < b ? 1 : -1));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (transactions ?? []).filter((t) => {
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (categoryFilter && t.category_id !== categoryFilter) return false;
      if (accountFilter && t.account_id !== accountFilter && t.to_account_id !== accountFilter) {
        return false;
      }
      if (monthFilter && !t.occurred_at.startsWith(monthFilter)) return false;
      if (query) {
        const category = categoryById.get(t.category_id ?? "");
        const account = accountById.get(t.account_id ?? "");
        const toAccount = accountById.get(t.to_account_id ?? "");
        const haystack = [t.description, category?.name, account?.name, toAccount?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [transactions, typeFilter, categoryFilter, accountFilter, monthFilter, search, categoryById, accountById]);

  const hasActiveFilters =
    search !== "" || typeFilter !== "all" || categoryFilter !== "" || accountFilter !== "" || monthFilter !== "";

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setCategoryFilter("");
    setAccountFilter("");
    setMonthFilter("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        {user && (
          <TransactionDialog userId={user.id} categories={categories ?? []} accounts={accounts ?? []} />
        )}
      </div>

      {(transactions?.length ?? 0) > 0 && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex gap-1 rounded-xl bg-muted p-1">
              {(
                [
                  { value: "all", label: "All" },
                  { value: "expense", label: "Expense" },
                  { value: "income", label: "Income" },
                  { value: "transfer", label: "Transfer" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTypeFilter(opt.value)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-all",
                    typeFilter === opt.value
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <Select
              value={categoryFilter}
              onValueChange={(value) => setCategoryFilter(value ?? "")}
            >
              <SelectTrigger size="sm">
                <SelectValue placeholder="All categories" className="gap-1.5">
                  {(value: string | null) => {
                    const c = categoryById.get(value ?? "");
                    return c ? (
                      <>
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </>
                    ) : (
                      "All categories"
                    );
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All categories</SelectItem>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={accountFilter} onValueChange={(value) => setAccountFilter(value ?? "")}>
              <SelectTrigger size="sm">
                <SelectValue placeholder="All accounts">
                  {(value: string | null) => accountById.get(value ?? "")?.name ?? "All accounts"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All accounts</SelectItem>
                {(accounts ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={monthFilter} onValueChange={(value) => setMonthFilter(value ?? "")}>
              <SelectTrigger size="sm">
                <SelectValue placeholder="All time">
                  {(value: string | null) => (value ? monthLabel(`${value}-01`) : "All time")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All time</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>
                    {monthLabel(`${m}-01`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={clearFilters}>
                <X className="size-3.5" /> Clear
              </Button>
            )}
          </div>

          {hasActiveFilters && (
            <p className="text-xs text-muted-foreground">
              {filteredTransactions.length} of {transactions?.length ?? 0} transactions
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {filteredTransactions.map((t) => (
          <TransactionRow
            key={t.id}
            userId={user!.id}
            transaction={t}
            categories={categories ?? []}
            accounts={accounts ?? []}
            category={categoryById.get(t.category_id ?? "")}
            account={accountById.get(t.account_id ?? "")}
          />
        ))}
        {transactions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
        {(transactions?.length ?? 0) > 0 && filteredTransactions.length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions match your filters.</p>
        )}
      </div>
    </div>
  );
}

function TransactionRow({
  userId,
  transaction: t,
  categories,
  accounts,
  category,
  account,
}: {
  userId: string;
  transaction: Transaction;
  categories: CategoryOption[];
  accounts: AccountOption[];
  category?: { name: string; color: string };
  account?: { name: string };
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);
  const isTransfer = t.type === "transfer";
  const toAccount = accounts.find((a) => a.id === t.to_account_id);

  return (
    <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {t.description || (isTransfer ? "Transfer" : t.type === "income" ? "Income" : "Expense")}
          </span>
          {isTransfer ? (
            <Badge variant="secondary" className="gap-1">
              <ArrowLeftRight className="size-3" />
              {account?.name ?? "?"} → {toAccount?.name ?? "?"}
            </Badge>
          ) : (
            <>
              {t.is_adjustment && (
                <Badge variant="secondary" className="gap-1">
                  <Scale className="size-3" /> Adjustment
                </Badge>
              )}
              {category && (
                <Badge variant="outline" style={{ borderColor: category.color }}>
                  {category.name}
                </Badge>
              )}
              {account && <Badge variant="secondary">{account.name}</Badge>}
            </>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(t.occurred_at).toLocaleDateString()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-semibold ${!isTransfer && t.type === "income" ? "text-emerald-600" : "text-foreground"}`}
        >
          {isTransfer ? "" : t.type === "income" ? "+" : "-"}
          {formatCurrency(t.amount, currency)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end">
            {/* The dialog lives outside the menu (below) — opening it from
                inside the menu would unmount it when the menu closes. */}
            <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={() => deleteTransaction(userId, t.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TransactionDialog
          userId={userId}
          categories={categories}
          accounts={accounts}
          transaction={t}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </div>
    </Card>
  );
}
