"use client";

import { useState, type FormEvent } from "react";
import { Calendar, HandCoins } from "lucide-react";
import { recordLoanPayment } from "@/lib/actions/loans";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, todayLocalDate } from "@/lib/format";
import type { Loan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Shared by the Loans page and the dashboard's "Upcoming payments" card —
// recording a payment here is what actually pays down a loan (see
// recordLoanPayment), since loan progress is computed from linked
// transactions rather than stored on the loan itself.
export function PaymentDialog({
  userId,
  loan,
  remaining,
}: {
  userId: string;
  loan: Loan;
  remaining: number;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [open, setOpen] = useState(false);
  // Recurring loans default to the usual monthly amount, one-time loans to
  // the full remaining balance (capped so you can't accidentally overpay).
  const suggested =
    loan.payment_type === "recurring" && loan.monthly_payment
      ? Math.min(loan.monthly_payment, remaining)
      : remaining;
  const [amount, setAmount] = useState(String(suggested));
  const [occurredAt, setOccurredAt] = useState(todayLocalDate());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await recordLoanPayment(userId, loan, Number(amount), new Date(occurredAt).toISOString());
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setAmount(String(suggested));
          setOccurredAt(todayLocalDate());
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <HandCoins className="h-4 w-4" /> Pay
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20">
              <HandCoins className="size-4 text-amber-500 dark:text-amber-400" />
            </span>
            <DialogTitle>Record payment · {loan.name}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount</Label>
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-amber-500/10 px-4 py-4 ring-1 ring-amber-500/20">
              <span className="text-2xl font-semibold text-amber-500 dark:text-amber-400">
                {currencySymbol}
              </span>
              <Input
                id="pay-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold text-amber-600 tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0 dark:text-amber-400"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(remaining, currency)} remaining on this loan.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Date</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="pay-date"
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
              className="w-full gap-1.5 border-none bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/25 transition-all hover:from-amber-600 hover:to-orange-700 active:scale-[0.98]"
            >
              <HandCoins className="size-4" />
              Record payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
