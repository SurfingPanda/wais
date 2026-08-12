"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Calendar,
  Check,
  MoreVertical,
  PenLine,
  Plus,
  Repeat,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import {
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  type RecurringInput,
} from "@/lib/actions/recurring";
import { getNextOccurrence } from "@/lib/recurrence";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { formatCurrency, shortDateLabel, todayLocalDate } from "@/lib/format";
import type { RecurringFrequency, RecurringTransaction, TransactionType } from "@/lib/types";
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

const WEEKDAYS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const RECURRING_TYPE_STYLES = {
  expense: {
    label: "Expense",
    icon: TrendingDown,
    active: "bg-rose-500 text-white shadow-sm shadow-rose-500/30",
    text: "text-rose-500 dark:text-rose-400",
    softBg: "bg-rose-500/10 ring-1 ring-rose-500/20",
    gradient: "from-rose-500 to-red-600",
  },
  income: {
    label: "Income",
    icon: TrendingUp,
    active: "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30",
    text: "text-emerald-500 dark:text-emerald-400",
    softBg: "bg-emerald-500/10 ring-1 ring-emerald-500/20",
    gradient: "from-emerald-500 to-teal-600",
  },
} as const;

export default function RecurringPage() {
  const { user } = useAuth();

  const rules = useLiveQuery(
    () =>
      user
        ? db.recurring_transactions
            .where("user_id")
            .equals(user.id)
            .filter((r) => !r.deleted_at)
            .toArray()
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring</h1>
        {user && (
          <RecurringDialog userId={user.id} categories={categories ?? []} accounts={accounts ?? []} />
        )}
      </div>

      <div className="space-y-3">
        {rules?.map((rule) => (
          <RecurringCard
            key={rule.id}
            userId={user!.id}
            rule={rule}
            categories={categories ?? []}
            accounts={accounts ?? []}
          />
        ))}
        {rules?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No recurring transactions yet. Add salary, rent, or a subscription and it&apos;ll be
            entered automatically each time it&apos;s due.
          </p>
        )}
      </div>
    </div>
  );
}

function RecurringCard({
  userId,
  rule,
  categories,
  accounts,
}: {
  userId: string;
  rule: RecurringTransaction;
  categories: { id: string; name: string; color?: string }[];
  accounts: { id: string; name: string }[];
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);
  const category = categories.find((c) => c.id === rule.category_id);
  const account = accounts.find((a) => a.id === rule.account_id);
  const next = getNextOccurrence(rule);

  return (
    <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{rule.description || "Untitled"}</span>
          <Badge variant="secondary" className="gap-1">
            <Repeat className="size-3" />
            {rule.frequency === "weekly" ? "Weekly" : "Monthly"}
          </Badge>
          {category && <Badge variant="outline">{category.name}</Badge>}
          {account && <Badge variant="secondary">{account.name}</Badge>}
        </div>
        <span className="text-xs text-muted-foreground">
          {next ? `Next ${shortDateLabel(next)}` : "Ended"}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`text-sm font-semibold ${rule.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}
        >
          {rule.type === "income" ? "+" : "-"}
          {formatCurrency(rule.amount, currency)}
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
              onClick={() => deleteRecurringTransaction(userId, rule.id)}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <RecurringDialog
          userId={userId}
          categories={categories}
          accounts={accounts}
          rule={rule}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </div>
    </Card>
  );
}

function RecurringDialog({
  userId,
  categories,
  accounts,
  rule,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  categories: { id: string; name: string; color?: string }[];
  accounts: { id: string; name: string }[];
  rule?: RecurringTransaction;
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
  const [type, setType] = useState<TransactionType>(rule?.type ?? "expense");
  const [amount, setAmount] = useState(rule ? String(rule.amount) : "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [accountId, setAccountId] = useState(rule?.account_id ?? "");
  const [frequency, setFrequency] = useState<RecurringFrequency>(rule?.frequency ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(rule?.day_of_month ? String(rule.day_of_month) : "1");
  const [weekday, setWeekday] = useState(rule?.weekday != null ? String(rule.weekday) : "1");
  const [startDate, setStartDate] = useState(rule?.start_date ?? todayLocalDate());
  const [endDate, setEndDate] = useState(rule?.end_date ?? "");

  // The dialog stays mounted between opens, so re-seed the form from the
  // current rule each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setType(rule?.type ?? "expense");
      setAmount(rule ? String(rule.amount) : "");
      setDescription(rule?.description ?? "");
      setCategoryId(rule?.category_id ?? "");
      setAccountId(rule?.account_id ?? "");
      setFrequency(rule?.frequency ?? "monthly");
      setDayOfMonth(rule?.day_of_month ? String(rule.day_of_month) : "1");
      setWeekday(rule?.weekday != null ? String(rule.weekday) : "1");
      setStartDate(rule?.start_date ?? todayLocalDate());
      setEndDate(rule?.end_date ?? "");
    }
    setOpen(next);
  }

  const activeType = RECURRING_TYPE_STYLES[type === "income" ? "income" : "expense"];
  const ActiveIcon = activeType.icon;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: RecurringInput = {
      amount: Number(amount),
      type,
      description,
      category_id: categoryId || null,
      account_id: accountId || null,
      frequency,
      day_of_month: frequency === "monthly" ? Number(dayOfMonth) : null,
      weekday: frequency === "weekly" ? Number(weekday) : null,
      start_date: startDate,
      end_date: endDate || null,
    };

    if (rule) {
      await updateRecurringTransaction(userId, rule.id, input);
    } else {
      await createRecurringTransaction(userId, input);
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
              <Plus className="h-4 w-4" /> Recurring
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
            <DialogTitle>{rule ? "Edit recurring transaction" : "New recurring transaction"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            {(Object.keys(RECURRING_TYPE_STYLES) as (keyof typeof RECURRING_TYPE_STYLES)[]).map(
              (t) => {
                const meta = RECURRING_TYPE_STYLES[t];
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
              },
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="recurring-amount">Amount</Label>
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
                id="recurring-amount"
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
            <Label htmlFor="recurring-description">Description</Label>
            <div className="relative">
              <PenLine className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="recurring-description"
                placeholder="e.g. Salary, Rent, Netflix"
                required
                className="pl-8"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={(value) => setCategoryId(value ?? "")}>
                <SelectTrigger className="w-full">
                  {/* Base UI renders the raw value unless given a formatter */}
                  <SelectValue placeholder="Uncategorized" className="gap-1.5">
                    {(value: string | null) => {
                      const c = categories.find((c) => c.id === value);
                      return c ? (
                        <>
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: c.color ?? "#94a3b8" }}
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
                        style={{ backgroundColor: c.color ?? "#94a3b8" }}
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
                  {/* Base UI renders the raw value unless given a formatter */}
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

          <div className="space-y-2">
            <Label>Frequency</Label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setFrequency("monthly")}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-all",
                  frequency === "monthly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setFrequency("weekly")}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-all",
                  frequency === "weekly"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Weekly
              </button>
            </div>
          </div>
          {frequency === "monthly" ? (
            <div className="space-y-2">
              <Label htmlFor="recurring-day">Day of month</Label>
              <Input
                id="recurring-day"
                type="number"
                min="1"
                max="31"
                required
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Falls on the last day of shorter months.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Day of week</Label>
              <Select value={weekday} onValueChange={(value) => value && setWeekday(value)}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(value: string) => WEEKDAYS.find((w) => w.value === value)?.label ?? ""}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((w) => (
                    <SelectItem key={w.value} value={w.value}>
                      {w.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <Label htmlFor="recurring-start">Starts</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="recurring-start"
                  type="date"
                  required
                  className="pl-8"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurring-end">Ends (optional)</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="recurring-end"
                  type="date"
                  className="pl-8"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className={cn(
                "w-full gap-1.5 border-none bg-gradient-to-r text-white shadow-md transition-all active:scale-[0.98]",
                activeType.gradient,
              )}
            >
              {rule ? <Check className="size-4" /> : <Plus className="size-4" />}
              {rule ? "Save changes" : "Create recurring transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
