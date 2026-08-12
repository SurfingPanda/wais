"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeftRight,
  ArrowRight,
  Calendar,
  Check,
  MoreVertical,
  PenLine,
  Plus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionInput,
} from "@/lib/actions/transactions";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, todayLocalDate } from "@/lib/format";
import type { Transaction, TransactionType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        {user && (
          <TransactionDialog userId={user.id} categories={categories ?? []} accounts={accounts ?? []} />
        )}
      </div>

      <div className="space-y-2">
        {transactions?.map((t) => (
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
      </div>
    </div>
  );
}

type CategoryOption = { id: string; name: string; color: string };
type AccountOption = { id: string; name: string };

const TYPE_STYLES: Record<
  TransactionType,
  {
    label: string;
    icon: typeof TrendingDown;
    active: string;
    text: string;
    softBg: string;
  }
> = {
  expense: {
    label: "Expense",
    icon: TrendingDown,
    active: "bg-rose-500 text-white shadow-sm shadow-rose-500/30",
    text: "text-rose-500 dark:text-rose-400",
    softBg: "bg-rose-500/10 ring-1 ring-rose-500/20",
  },
  income: {
    label: "Income",
    icon: TrendingUp,
    active: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
    text: "text-emerald-500 dark:text-emerald-400",
    softBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20",
  },
  transfer: {
    label: "Transfer",
    icon: ArrowLeftRight,
    active: "bg-sky-500 text-white shadow-sm shadow-sky-500/30",
    text: "text-sky-500 dark:text-sky-400",
    softBg: "bg-sky-500/10 ring-1 ring-sky-500/20",
  },
};

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

function TransactionDialog({
  userId,
  categories,
  accounts,
  transaction,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  categories: CategoryOption[];
  accounts: AccountOption[];
  transaction?: Transaction;
  // When provided, the dialog is controlled by the parent (e.g. opened from
  // a menu item) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [accountId, setAccountId] = useState(transaction?.account_id ?? "");
  const [toAccountId, setToAccountId] = useState(transaction?.to_account_id ?? "");
  const [occurredAt, setOccurredAt] = useState(
    transaction ? transaction.occurred_at.slice(0, 10) : todayLocalDate(),
  );
  const isTransfer = type === "transfer";

  // The dialog stays mounted between opens, so re-seed the form from the
  // current transaction each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setType(transaction?.type ?? "expense");
      setAmount(transaction ? String(transaction.amount) : "");
      setDescription(transaction?.description ?? "");
      setCategoryId(transaction?.category_id ?? "");
      setAccountId(transaction?.account_id ?? "");
      setToAccountId(transaction?.to_account_id ?? "");
      setOccurredAt(transaction ? transaction.occurred_at.slice(0, 10) : todayLocalDate());
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (isTransfer) {
      if (!accountId || !toAccountId) {
        toast.error("Pick both a from and a to account.");
        return;
      }
      if (accountId === toAccountId) {
        toast.error("Pick two different accounts.");
        return;
      }
    }

    const input: TransactionInput = {
      amount: Number(amount),
      type,
      description,
      category_id: isTransfer ? null : categoryId || null,
      account_id: accountId || null,
      to_account_id: isTransfer ? toAccountId : null,
      occurred_at: new Date(occurredAt).toISOString(),
    };

    if (transaction) {
      await updateTransaction(userId, transaction.id, input);
    } else {
      await createTransaction(userId, input);
      setAmount("");
      setDescription("");
    }
    setOpen(false);
  }

  const activeType = TYPE_STYLES[type];
  const ActiveIcon = activeType.icon;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Transaction
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                activeType.softBg,
              )}
            >
              <ActiveIcon className={cn("size-4", activeType.text)} />
            </span>
            <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          {/* Type segmented control */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {(Object.keys(TYPE_STYLES) as TransactionType[]).map((t) => {
              const meta = TYPE_STYLES[t];
              const TypeIcon = meta.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-all",
                    active ? meta.active : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TypeIcon className="size-4" />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Big, color-matched amount entry */}
          <div className="space-y-2">
            <Label htmlFor="tx-amount">Amount</Label>
            <div
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border border-input px-4 py-4 transition-colors",
                activeType.softBg,
              )}
            >
              <span className={cn("text-2xl font-semibold", activeType.text)}>
                {currencySymbol}
              </span>
              <Input
                id="tx-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0",
                  activeType.text,
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <div className="relative">
              <PenLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tx-description"
                placeholder="e.g. Coffee with friends"
                className="pl-8"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          {isTransfer ? (
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="space-y-2">
                <Label>From</Label>
                <Select value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No account">
                      {(value: string | null) =>
                        accounts.find((a) => a.id === value)?.name ?? "No account"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <ArrowRight className="mb-2 size-4 shrink-0 text-muted-foreground" />
              <div className="space-y-2">
                <Label>To</Label>
                <Select value={toAccountId} onValueChange={(value) => setToAccountId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No account">
                      {(value: string | null) =>
                        accounts.find((a) => a.id === value)?.name ?? "No account"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Uncategorized" className="gap-1.5">
                      {(value: string | null) => {
                        const c = categories.find((c) => c.id === value);
                        return c ? (
                          <>
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: c.color }}
                            />
                            {c.name}
                          </>
                        ) : (
                          "Uncategorized"
                        );
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
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
              </div>
              <div className="space-y-2">
                <Label>Account</Label>
                <Select value={accountId} onValueChange={(value) => setAccountId(value ?? "")}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="No account">
                      {(value: string | null) =>
                        accounts.find((a) => a.id === value)?.name ?? "No account"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tx-date">Date</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tx-date"
                type="date"
                required
                className="pl-8"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              className="w-full gap-1.5 border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98]"
            >
              {transaction ? <Check className="size-4" /> : <Plus className="size-4" />}
              {transaction ? "Save changes" : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
