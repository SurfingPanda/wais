"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MoreVertical, Plus } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionInput,
} from "@/lib/actions/transactions";
import { useCurrency } from "@/lib/currency";
import { formatCurrency } from "@/lib/format";
import type { Transaction, TransactionType } from "@/lib/types";
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

function todayLocalDate() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

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

  const categoryById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c])),
    [categories],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        {user && <TransactionDialog userId={user.id} categories={categories ?? []} />}
      </div>

      <div className="space-y-2">
        {transactions?.map((t) => (
          <TransactionRow
            key={t.id}
            userId={user!.id}
            transaction={t}
            categories={categories ?? []}
            category={categoryById.get(t.category_id ?? "")}
          />
        ))}
        {transactions?.length === 0 && (
          <p className="text-sm text-muted-foreground">No transactions yet.</p>
        )}
      </div>
    </div>
  );
}

function TransactionRow({
  userId,
  transaction: t,
  categories,
  category,
}: {
  userId: string;
  transaction: Transaction;
  categories: { id: string; name: string }[];
  category?: { name: string; color: string };
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {t.description || (t.type === "income" ? "Income" : "Expense")}
          </span>
          {category && (
            <Badge variant="outline" style={{ borderColor: category.color }}>
              {category.name}
            </Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {new Date(t.occurred_at).toLocaleDateString()}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`text-sm font-semibold ${t.type === "income" ? "text-emerald-600" : "text-foreground"}`}
        >
          {t.type === "income" ? "+" : "-"}
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
  transaction,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  categories: { id: string; name: string }[];
  transaction?: Transaction;
  // When provided, the dialog is controlled by the parent (e.g. opened from
  // a menu item) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? "");
  const [occurredAt, setOccurredAt] = useState(
    transaction ? transaction.occurred_at.slice(0, 10) : todayLocalDate(),
  );

  // The dialog stays mounted between opens, so re-seed the form from the
  // current transaction each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setType(transaction?.type ?? "expense");
      setAmount(transaction ? String(transaction.amount) : "");
      setDescription(transaction?.description ?? "");
      setCategoryId(transaction?.category_id ?? "");
      setOccurredAt(transaction ? transaction.occurred_at.slice(0, 10) : todayLocalDate());
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: TransactionInput = {
      amount: Number(amount),
      type,
      description,
      category_id: categoryId || null,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transaction ? "Edit transaction" : "New transaction"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={type === "expense" ? "default" : "outline"}
              onClick={() => setType("expense")}
            >
              Expense
            </Button>
            <Button
              type="button"
              variant={type === "income" ? "default" : "outline"}
              onClick={() => setType("income")}
            >
              Income
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-amount">Amount</Label>
            <Input
              id="tx-amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-description">Description</Label>
            <Input
              id="tx-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
              <SelectTrigger className="w-full">
                {/* Base UI renders the raw value unless given a formatter */}
                <SelectValue placeholder="None">
                  {(value: string | null) =>
                    categories.find((c) => c.id === value)?.name ?? "None"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="tx-date">Date</Label>
            <Input
              id="tx-date"
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit">{transaction ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
