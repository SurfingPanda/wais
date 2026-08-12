"use client";

import { useState, type FormEvent } from "react";
import { Calendar, PiggyBank } from "lucide-react";
import { recordGoalContribution } from "@/lib/actions/goals";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, todayLocalDate } from "@/lib/format";
import type { SavingsGoal } from "@/lib/types";
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

// Shared by the Goals page and (eventually) the dashboard — recording a
// contribution here is what actually grows a goal, since goal progress is
// computed from linked transactions rather than stored on the goal itself.
export function ContributionDialog({
  userId,
  goal,
  remaining,
}: {
  userId: string;
  goal: SavingsGoal;
  remaining: number;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [open, setOpen] = useState(false);
  const suggested = Math.max(remaining, 0);
  const [amount, setAmount] = useState(String(suggested));
  const [occurredAt, setOccurredAt] = useState(todayLocalDate());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await recordGoalContribution(userId, goal, Number(amount), new Date(occurredAt).toISOString());
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
            <PiggyBank className="h-4 w-4" /> Contribute
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <PiggyBank className="size-4 text-emerald-500 dark:text-emerald-400" />
            </span>
            <DialogTitle>Add funds · {goal.name}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="contribute-amount">Amount</Label>
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-emerald-500/10 px-4 py-4 ring-1 ring-emerald-500/20">
              <span className="text-2xl font-semibold text-emerald-500 dark:text-emerald-400">
                {currencySymbol}
              </span>
              <Input
                id="contribute-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold text-emerald-600 tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0 dark:text-emerald-400"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(remaining, currency)} left to reach this goal.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contribute-date">Date</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contribute-date"
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
              <PiggyBank className="size-4" />
              Add funds
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
