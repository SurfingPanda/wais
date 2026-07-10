"use client";

import { useState, type FormEvent } from "react";
import { HandCoins } from "lucide-react";
import { recordLoanPayment } from "@/lib/actions/loans";
import { useCurrency } from "@/lib/currency";
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record payment · {loan.name}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {formatCurrency(remaining, currency)} remaining on this loan.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Date</Label>
            <Input
              id="pay-date"
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit">Record payment</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
