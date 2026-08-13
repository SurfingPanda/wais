"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Calendar,
  Check,
  MoreVertical,
  PartyPopper,
  PiggyBank,
  Plus,
  Target,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createGoal, updateGoal, deleteGoal, type GoalInput } from "@/lib/actions/goals";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, shortDateLabel, todayLocalDate } from "@/lib/format";
import { computeGoalHealth, needsAttention } from "@/lib/goal-health";
import { generateGoalInsight, fallbackGoalInsight } from "@/lib/ai/insights";
import { useOwlieInsight } from "@/lib/ai/use-owlie-insight";
import type { Category, SavingsGoal } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ContributionDialog } from "@/components/goal-contribution-dialog";
import { OwlieTip } from "@/components/owlie";
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

export default function GoalsPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();

  const goals = useLiveQuery(
    () =>
      user
        ? db.savings_goals.where("user_id").equals(user.id).filter((g) => !g.deleted_at).toArray()
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

  const contributions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at && !!t.goal_id)
            .toArray()
        : [],
    [user?.id],
  );

  const contributedByGoal = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of contributions ?? []) {
      if (!t.goal_id) continue;
      totals.set(t.goal_id, (totals.get(t.goal_id) ?? 0) + t.amount);
    }
    return totals;
  }, [contributions]);

  const totalSaved = useMemo(
    () => (goals ?? []).reduce((sum, g) => sum + (contributedByGoal.get(g.id) ?? 0), 0),
    [goals, contributedByGoal],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Goals</h1>
          {(goals?.length ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatCurrency(totalSaved, currency)} saved so far
            </p>
          )}
        </div>
        {user && <GoalDialog userId={user.id} categories={categories ?? []} />}
      </div>

      <div className="space-y-3">
        {goals?.map((goal) => (
          <GoalCard
            key={goal.id}
            userId={user!.id}
            goal={goal}
            categories={categories ?? []}
            contributed={contributedByGoal.get(goal.id) ?? 0}
          />
        ))}
        {goals?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No goals yet. Set a target and add funds toward it — each contribution is saved as an
            expense.
          </p>
        )}
      </div>
    </div>
  );
}

function GoalCard({
  userId,
  goal,
  categories,
  contributed,
}: {
  userId: string;
  goal: SavingsGoal;
  categories: Category[];
  contributed: number;
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);
  const remaining = Math.max(0, goal.target_amount - contributed);
  const health = computeGoalHealth(goal, contributed, todayLocalDate());
  const pct = health.pct;
  const reached = health.reached;

  return (
    <Card className="space-y-3 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium">{goal.name}</span>
            {reached && (
              <Badge className="gap-1 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                <PartyPopper className="size-3" /> Reached
              </Badge>
            )}
            {goal.target_date && (
              <Badge variant="secondary">Target {shortDateLabel(goal.target_date)}</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(goal.target_amount, currency)} target
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {!reached && <ContributionDialog userId={userId} goal={goal} remaining={remaining} />}
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
              <DropdownMenuItem variant="destructive" onClick={() => deleteGoal(userId, goal.id)}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <GoalDialog
            userId={userId}
            categories={categories}
            goal={goal}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", reached ? "bg-emerald-500" : "bg-teal-600")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(contributed, currency)} saved</span>
        <span>{reached ? "Goal reached" : `${formatCurrency(remaining, currency)} to go`}</span>
      </div>
      {needsAttention(health) && <GoalInsight goal={goal} health={health} currency={currency} />}
    </Card>
  );
}

function GoalInsight({
  goal,
  health,
  currency,
}: {
  goal: SavingsGoal;
  health: ReturnType<typeof computeGoalHealth>;
  currency: string;
}) {
  const { insight, loading } = useOwlieInsight(
    () => fallbackGoalInsight(goal, health, currency),
    () => generateGoalInsight(goal, health, currency),
    [goal.id, health.status, health.behindByPct, currency],
  );

  if (!insight) return null;

  return (
    <OwlieTip tone={insight.tone} size="sm" loading={loading}>
      {insight.text}
    </OwlieTip>
  );
}

function GoalDialog({
  userId,
  categories,
  goal,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  categories: Category[];
  goal?: SavingsGoal;
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
  const [name, setName] = useState(goal?.name ?? "");
  const [targetAmount, setTargetAmount] = useState(goal ? String(goal.target_amount) : "");
  const [targetDate, setTargetDate] = useState(goal?.target_date ?? "");
  const [categoryId, setCategoryId] = useState(goal?.category_id ?? "");

  // The dialog stays mounted between opens, so re-seed the form from the
  // current goal each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(goal?.name ?? "");
      setTargetAmount(goal ? String(goal.target_amount) : "");
      setTargetDate(goal?.target_date ?? "");
      setCategoryId(goal?.category_id ?? "");
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: GoalInput = {
      name,
      target_amount: Number(targetAmount),
      target_date: targetDate || null,
      category_id: categoryId || null,
    };

    if (goal) {
      await updateGoal(userId, goal.id, input);
    } else {
      await createGoal(userId, input);
      setName("");
      setTargetAmount("");
      setTargetDate("");
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Goal
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20">
              <PiggyBank className="size-4 text-emerald-500 dark:text-emerald-400" />
            </span>
            <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="goal-name">Name</Label>
            <div className="relative">
              <Target className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="goal-name"
                required
                placeholder="e.g. Emergency fund"
                className="pl-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-target">Target amount</Label>
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-emerald-500/10 px-4 py-4 ring-1 ring-emerald-500/20">
              <span className="text-2xl font-semibold text-emerald-500 dark:text-emerald-400">
                {currencySymbol}
              </span>
              <Input
                id="goal-target"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                className="h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold text-emerald-600 tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0 dark:text-emerald-400"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-date">Target date (optional)</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="goal-date"
                type="date"
                className="pl-8"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
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
              Contributions you record are saved as expenses in this category.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full gap-1.5 border-none bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 transition-all hover:from-emerald-600 hover:to-teal-700 active:scale-[0.98]"
            >
              {goal ? <Check className="size-4" /> : <Plus className="size-4" />}
              {goal ? "Save changes" : "Create goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
