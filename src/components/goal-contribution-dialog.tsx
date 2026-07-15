"use client";

import { useState, type FormEvent } from "react";
import { PiggyBank } from "lucide-react";
import { recordGoalContribution } from "@/lib/actions/goals";
import { useCurrency } from "@/lib/currency";
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add funds · {goal.name}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="contribute-amount">Amount</Label>
            <Input
              id="contribute-amount"
              type="number"
              step="0.01"
              min="0"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {formatCurrency(remaining, currency)} left to reach this goal.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contribute-date">Date</Label>
            <Input
              id="contribute-date"
              type="date"
              required
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit">Add funds</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
