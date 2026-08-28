"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  HandCoins,
  MoreVertical,
  Plus,
  RefreshCw,
  Tag,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createLoan, updateLoan, deleteLoan, type LoanInput } from "@/lib/actions/loans";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { currentMonth, formatCurrency } from "@/lib/format";
import { getLoanDueInfo, type LoanDueInfo } from "@/lib/loans";
import type { Category, Loan, LoanPaymentType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PaymentDialog } from "@/components/loan-payment-dialog";
import { DueBadge } from "@/components/loan-due-badge";
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

export default function LoansPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();

  const loans = useLiveQuery(
    () =>
      user
        ? db.loans.filter((l) => !l.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const categories = useLiveQuery(
    () =>
      user
        ? db.categories.filter((c) => !c.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const payments = useLiveQuery(
    () =>
      user
        ? db.transactions
            .filter((t) => !t.deleted_at && !!t.loan_id)
            .toArray()
        : [],
    [user?.id],
  );

  const paidByLoan = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of payments ?? []) {
      if (!t.loan_id) continue;
      totals.set(t.loan_id, (totals.get(t.loan_id) ?? 0) + t.amount);
    }
    return totals;
  }, [payments]);

  // "Recurring" is a payment plan, not automation — this flags loans that
  // haven't had a payment recorded yet in the current calendar month, so
  // they don't silently fall through the cracks.
  const paidThisMonthLoanIds = useMemo(() => {
    const thisMonth = currentMonth().slice(0, 7);
    const ids = new Set<string>();
    for (const t of payments ?? []) {
      if (t.loan_id && t.occurred_at.slice(0, 7) === thisMonth) ids.add(t.loan_id);
    }
    return ids;
  }, [payments]);

  const totalRemaining = useMemo(
    () =>
      (loans ?? []).reduce(
        (sum, l) => sum + Math.max(0, l.principal - (paidByLoan.get(l.id) ?? 0)),
        0,
      ),
    [loans, paidByLoan],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Loans</h1>
          {(loans?.length ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatCurrency(totalRemaining, currency)} left to pay off
            </p>
          )}
        </div>
        {user && <LoanDialog userId={user.id} categories={categories ?? []} />}
      </div>

      <div className="space-y-3">
        {loans?.map((loan) => {
          const paid = paidByLoan.get(loan.id) ?? 0;
          const paidOff = loan.principal - paid <= 0;
          const cyclePaid =
            paidOff || (loan.payment_type === "recurring" && paidThisMonthLoanIds.has(loan.id));
          return (
            <LoanCard
              key={loan.id}
              userId={user!.id}
              loan={loan}
              categories={categories ?? []}
              paid={paid}
              dueInfo={getLoanDueInfo(loan, cyclePaid)}
            />
          );
        })}
        {loans?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No loans yet. Register one and record payments against it — each payment is saved as
            an expense.
          </p>
        )}
      </div>
    </div>
  );
}

function LoanCard({
  userId,
  loan,
  categories,
  paid,
  dueInfo,
}: {
  userId: string;
  loan: Loan;
  categories: Category[];
  paid: number;
  dueInfo: LoanDueInfo | null;
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);
  const remaining = Math.max(0, loan.principal - paid);
  const pct = loan.principal > 0 ? Math.min(100, (paid / loan.principal) * 100) : 0;
  const paidOff = remaining <= 0;

  return (
    <Card className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{loan.name}</span>
            <Badge variant="secondary" className="gap-1">
              {loan.payment_type === "recurring" && <RefreshCw className="size-3" />}
              {loan.payment_type === "recurring" ? "Recurring" : "One-time"}
            </Badge>
            {paidOff && (
              <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3" /> Paid off
              </Badge>
            )}
            {!paidOff && dueInfo && <DueBadge dueInfo={dueInfo} />}
          </div>
          <p className="text-xs text-muted-foreground">
            {loan.payment_type === "recurring" && loan.monthly_payment
              ? `${formatCurrency(loan.monthly_payment, currency)}/month · `
              : ""}
            {formatCurrency(loan.principal, currency)} total
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!paidOff && (
            <PaymentDialog userId={userId} loan={loan} remaining={remaining} />
          )}
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
              <DropdownMenuItem variant="destructive" onClick={() => deleteLoan(userId, loan.id)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <LoanDialog
            userId={userId}
            categories={categories}
            loan={loan}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", paidOff ? "bg-emerald-500" : "bg-teal-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(paid, currency)} paid</span>
        <span>
          {paidOff ? "Fully paid" : `${formatCurrency(remaining, currency)} remaining`}
        </span>
      </div>
    </Card>
  );
}

function LoanDialog({
  userId,
  categories,
  loan,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  categories: Category[];
  loan?: Loan;
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
  const [name, setName] = useState(loan?.name ?? "");
  const [principal, setPrincipal] = useState(loan ? String(loan.principal) : "");
  const [paymentType, setPaymentType] = useState<LoanPaymentType>(loan?.payment_type ?? "recurring");
  const [monthlyPayment, setMonthlyPayment] = useState(
    loan?.monthly_payment ? String(loan.monthly_payment) : "",
  );
  const [dueDay, setDueDay] = useState(loan?.due_day ? String(loan.due_day) : "");
  const [dueDate, setDueDate] = useState(loan?.due_date ?? "");
  const [categoryId, setCategoryId] = useState(loan?.category_id ?? "");
  const [reminderDaysBefore, setReminderDaysBefore] = useState(
    loan?.reminder_days_before != null ? String(loan.reminder_days_before) : "",
  );

  // The dialog stays mounted between opens, so re-seed the form from the
  // current loan each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(loan?.name ?? "");
      setPrincipal(loan ? String(loan.principal) : "");
      setPaymentType(loan?.payment_type ?? "recurring");
      setMonthlyPayment(loan?.monthly_payment ? String(loan.monthly_payment) : "");
      setDueDay(loan?.due_day ? String(loan.due_day) : "");
      setDueDate(loan?.due_date ?? "");
      setCategoryId(loan?.category_id ?? "");
      setReminderDaysBefore(loan?.reminder_days_before != null ? String(loan.reminder_days_before) : "");
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: LoanInput = {
      name,
      principal: Number(principal),
      payment_type: paymentType,
      monthly_payment: paymentType === "recurring" && monthlyPayment ? Number(monthlyPayment) : null,
      due_day: paymentType === "recurring" && dueDay ? Number(dueDay) : null,
      due_date: paymentType === "one_time" && dueDate ? dueDate : null,
      category_id: categoryId || null,
      reminder_days_before: reminderDaysBefore ? Number(reminderDaysBefore) : null,
    };

    if (loan) {
      await updateLoan(userId, loan.id, input);
    } else {
      await createLoan(userId, input);
      setName("");
      setPrincipal("");
      setMonthlyPayment("");
      setDueDay("");
      setDueDate("");
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Loan
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
              <HandCoins className="size-4 text-amber-500 dark:text-amber-400" />
            </span>
            <DialogTitle>{loan ? "Edit loan" : "New loan"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="loan-name">Name</Label>
            <div className="relative">
              <Tag className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="loan-name"
                required
                placeholder="e.g. Car loan"
                className="pl-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="loan-principal">Total amount</Label>
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-amber-500/10 px-4 py-4 ring-1 ring-amber-500/20">
              <span className="text-2xl font-semibold text-amber-500 dark:text-amber-400">
                {currencySymbol}
              </span>
              <Input
                id="loan-principal"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={principal}
                onChange={(e) => setPrincipal(e.target.value)}
                className="h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold text-amber-600 tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0 dark:text-amber-400"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Payment plan</Label>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
              <button
                type="button"
                onClick={() => setPaymentType("recurring")}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-all",
                  paymentType === "recurring"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Recurring
              </button>
              <button
                type="button"
                onClick={() => setPaymentType("one_time")}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-all",
                  paymentType === "one_time"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                One-time
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {paymentType === "recurring"
                ? "Paid down in regular monthly payments."
                : "Settled with a single payment."}
            </p>
          </div>
          {paymentType === "recurring" && (
            <div className="space-y-2">
              <Label htmlFor="loan-monthly">Monthly payment</Label>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">
                  {currencySymbol}
                </span>
                <Input
                  id="loan-monthly"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0"
                  required
                  className="pl-7"
                  value={monthlyPayment}
                  onChange={(e) => setMonthlyPayment(e.target.value)}
                />
              </div>
            </div>
          )}
          {paymentType === "recurring" ? (
            <div className="space-y-2">
              <Label htmlFor="loan-due-day">Due day of month (optional)</Label>
              <Input
                id="loan-due-day"
                type="number"
                min="1"
                max="31"
                placeholder="e.g. 15"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                You&apos;ll get a reminder as this day approaches each month.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="loan-due-date">Due date (optional)</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="loan-due-date"
                  type="date"
                  className="pl-8"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                You&apos;ll get a reminder as this date approaches.
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="loan-reminder">Push reminder (optional)</Label>
            <div className="relative">
              <Bell className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="loan-reminder"
                type="number"
                min="0"
                max="30"
                placeholder="e.g. 3"
                className="pl-8"
                value={reminderDaysBefore}
                onChange={(e) => setReminderDaysBefore(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Days before it&apos;s due to send a push notification. Requires push
              reminders enabled in your account menu.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Expense category</Label>
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
            <p className="text-xs text-muted-foreground">
              Payments you record are saved as expenses in this category.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full gap-1.5 border-none bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/25 transition-all hover:from-amber-600 hover:to-orange-700 active:scale-[0.98]"
            >
              {loan ? <Check className="size-4" /> : <Plus className="size-4" />}
              {loan ? "Save changes" : "Create loan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

