"use client";

import { useState, type FormEvent } from "react";
import { Calendar, Plus, Receipt, X } from "lucide-react";
import { recordGroceryReceipt } from "@/lib/actions/groceries";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, todayLocalDate } from "@/lib/format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ReceiptableItem {
  id: string;
  name: string;
  lastPrice: number | null;
}

// Sentinel select value for "this isn't one of my tracked items yet" — kept
// out of uuid-space so it can never collide with a real item id.
const NEW_ITEM_VALUE = "__new__";

interface ReceiptLine {
  key: string;
  itemId: string; // "", an existing item's id, or NEW_ITEM_VALUE
  newName: string; // only used when itemId === NEW_ITEM_VALUE
  price: string;
}

function emptyLine(): ReceiptLine {
  return { key: crypto.randomUUID(), itemId: "", newName: "", price: "" };
}

// Types a whole receipt in one pass — one row per line item, running total
// as you go — instead of logging purchases one at a time. Picking a
// tracked item auto-fills its last price (still editable, since prices
// change); items not tracked yet can be typed in as a new line. Each line
// becomes its own purchase (see recordGroceryReceipt).
export function GroceryReceiptDialog({
  userId,
  items,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  items: ReceiptableItem[];
  // When provided, the dialog is controlled by the parent (e.g. a dashboard
  // quick action) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [occurredAt, setOccurredAt] = useState(todayLocalDate());
  const [lines, setLines] = useState<ReceiptLine[]>([emptyLine(), emptyLine(), emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const sortedItems = [...items].sort((a, b) => a.name.localeCompare(b.name));

  const resolvedLines = lines.map((l) => {
    const item = l.itemId && l.itemId !== NEW_ITEM_VALUE ? items.find((i) => i.id === l.itemId) : undefined;
    const name = l.itemId === NEW_ITEM_VALUE ? l.newName.trim() : (item?.name ?? "");
    return { ...l, name, amount: Number(l.price) };
  });
  const validLines = resolvedLines.filter(
    (l) => l.name && l.price !== "" && Number.isFinite(l.amount) && l.amount >= 0,
  );
  const total = validLines.reduce((sum, l) => sum + l.amount, 0);

  function updateLine(key: string, patch: Partial<ReceiptLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function selectItem(key: string, value: string | null) {
    if (!value) return;
    if (value === NEW_ITEM_VALUE) {
      updateLine(key, { itemId: NEW_ITEM_VALUE, newName: "", price: "" });
      return;
    }
    const item = items.find((i) => i.id === value);
    updateLine(key, {
      itemId: value,
      newName: "",
      price: item?.lastPrice !== null && item?.lastPrice !== undefined ? String(item.lastPrice) : "",
    });
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (validLines.length === 0) return;
    setSubmitting(true);
    try {
      await recordGroceryReceipt(
        userId,
        validLines.map((l) => ({ name: l.name, price: l.amount })),
        new Date(occurredAt).toISOString(),
      );
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setOccurredAt(todayLocalDate());
          setLines([emptyLine(), emptyLine(), emptyLine()]);
        }
      }}
    >
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button variant="outline" size="sm" className="gap-1.5">
              <Receipt className="h-4 w-4" /> Log receipt
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime-500/10 ring-1 ring-lime-500/20">
              <Receipt className="size-4 text-lime-600 dark:text-lime-400" />
            </span>
            <DialogTitle>Log a receipt</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="receipt-date">Date</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="receipt-date"
                type="date"
                required
                className="pl-8"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="flex items-start gap-1.5">
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Select value={line.itemId} onValueChange={(value) => selectItem(line.key, value)}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select item">
                          {(value: string | null) => {
                            if (value === NEW_ITEM_VALUE) return "New item";
                            const item = items.find((i) => i.id === value);
                            return item?.name ?? "Select item";
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {sortedItems.map((i) => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name}
                          </SelectItem>
                        ))}
                        {sortedItems.length > 0 && <SelectSeparator />}
                        <SelectItem value={NEW_ITEM_VALUE}>
                          <Plus className="size-3.5" /> New item
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {line.itemId === NEW_ITEM_VALUE && (
                      <Input
                        autoFocus
                        placeholder="New item name"
                        value={line.newName}
                        onChange={(e) => updateLine(line.key, { newName: e.target.value })}
                      />
                    )}
                  </div>
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                      {currencySymbol}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={line.price}
                      onChange={(e) => updateLine(line.key, { price: e.target.value })}
                      className="pl-5 text-right tabular-nums"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-7 shrink-0"
                    disabled={lines.length === 1}
                    onClick={() => removeLine(line.key)}
                    aria-label="Remove line"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5"
              onClick={() => setLines((prev) => [...prev, emptyLine()])}
            >
              <Plus className="size-3.5" /> Add line
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-input bg-lime-500/10 px-4 py-3 ring-1 ring-lime-500/20">
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums text-lime-700 dark:text-lime-400">
              {formatCurrency(total, currency)}
            </span>
          </div>

          <DialogFooter>
            <Button
              type="submit"
              disabled={validLines.length === 0 || submitting}
              className="w-full gap-1.5 border-none bg-gradient-to-r from-lime-500 to-green-600 text-white shadow-md shadow-lime-500/25 transition-all hover:from-lime-600 hover:to-green-700 active:scale-[0.98]"
            >
              <Receipt className="size-4" />
              {submitting
                ? "Logging…"
                : `Log ${validLines.length || ""} item${validLines.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
