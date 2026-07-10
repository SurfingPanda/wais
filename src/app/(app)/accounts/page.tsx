"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Banknote,
  CreditCard,
  Landmark,
  MoreVertical,
  PiggyBank,
  Plus,
  Wallet,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createAccount, updateAccount, deleteAccount, type AccountInput } from "@/lib/actions/accounts";
import { useCurrency } from "@/lib/currency";
import { formatCurrency } from "@/lib/format";
import type { Account, AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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

const ACCOUNT_TYPES: { value: AccountType; label: string; icon: typeof Wallet }[] = [
  { value: "cash", label: "Cash", icon: Banknote },
  { value: "checking", label: "Checking", icon: Landmark },
  { value: "savings", label: "Savings", icon: PiggyBank },
  { value: "debit_card", label: "Debit Card", icon: CreditCard },
  { value: "credit_card", label: "Credit Card", icon: CreditCard },
  { value: "other", label: "Other", icon: Wallet },
];

function accountTypeMeta(type: AccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[ACCOUNT_TYPES.length - 1];
}

export default function AccountsPage() {
  const { user } = useAuth();
  const { currency } = useCurrency();

  const accounts = useLiveQuery(
    () =>
      user
        ? db.accounts.where("user_id").equals(user.id).filter((a) => !a.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const transactions = useLiveQuery(
    () =>
      user
        ? db.transactions
            .where("user_id")
            .equals(user.id)
            .filter((t) => !t.deleted_at && !!t.account_id)
            .toArray()
        : [],
    [user?.id],
  );

  const netByAccount = useMemo(() => {
    const totals = new Map<string, number>();
    for (const t of transactions ?? []) {
      if (!t.account_id) continue;
      const delta = t.type === "income" ? t.amount : -t.amount;
      totals.set(t.account_id, (totals.get(t.account_id) ?? 0) + delta);
    }
    return totals;
  }, [transactions]);

  const totalBalance = useMemo(
    () =>
      (accounts ?? []).reduce(
        (sum, a) => sum + a.starting_balance + (netByAccount.get(a.id) ?? 0),
        0,
      ),
    [accounts, netByAccount],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Accounts</h1>
          {(accounts?.length ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatCurrency(totalBalance, currency)} total
            </p>
          )}
        </div>
        {user && <AccountDialog userId={user.id} />}
      </div>

      <div className="space-y-3">
        {accounts?.map((account) => (
          <AccountCard
            key={account.id}
            userId={user!.id}
            account={account}
            balance={account.starting_balance + (netByAccount.get(account.id) ?? 0)}
          />
        ))}
        {accounts?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No accounts yet. Add one for each place your money lives — cash, a debit card, a
            credit card — and tag transactions to it to track its balance.
          </p>
        )}
      </div>
    </div>
  );
}

function AccountCard({
  userId,
  account,
  balance,
}: {
  userId: string;
  account: Account;
  balance: number;
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);
  const meta = accountTypeMeta(account.type);
  const Icon = meta.icon;
  const negative = balance < 0;

  return (
    <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="text-xs text-muted-foreground">{meta.label}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "text-sm font-semibold tabular-nums",
            negative ? "text-red-600 dark:text-red-400" : "text-foreground",
          )}
        >
          {formatCurrency(balance, currency)}
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
            <DropdownMenuItem variant="destructive" onClick={() => deleteAccount(userId, account.id)}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AccountDialog
          userId={userId}
          account={account}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      </div>
    </Card>
  );
}

function AccountDialog({
  userId,
  account,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  account?: Account;
  // When provided, the dialog is controlled by the parent (e.g. opened from
  // a menu item) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "cash");
  const [startingBalance, setStartingBalance] = useState(
    account ? String(account.starting_balance) : "",
  );

  // The dialog stays mounted between opens, so re-seed the form from the
  // current account each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(account?.name ?? "");
      setType(account?.type ?? "cash");
      setStartingBalance(account ? String(account.starting_balance) : "");
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: AccountInput = {
      name,
      type,
      starting_balance: startingBalance ? Number(startingBalance) : 0,
    };

    if (account) {
      await updateAccount(userId, account.id, input);
    } else {
      await createAccount(userId, input);
      setName("");
      setStartingBalance("");
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Account
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="account-name">Name</Label>
            <Input
              id="account-name"
              required
              placeholder="e.g. BDO Debit"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(value) => value && setType(value as AccountType)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: AccountType) => accountTypeMeta(value).label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="account-balance">
              {account ? "Starting balance" : "Current balance"}
            </Label>
            <Input
              id="account-balance"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={startingBalance}
              onChange={(e) => setStartingBalance(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {account
                ? "Adjusting this shifts the balance without adding a transaction."
                : "Transactions you tag to this account will move the balance from here."}
            </p>
          </div>
          <DialogFooter>
            <Button type="submit">{account ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
