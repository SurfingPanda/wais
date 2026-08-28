"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Calendar, Loader2, Plus, Receipt, Sparkles, Store, X } from "lucide-react";
import { toast } from "sonner";
import { recordGroceryReceipt } from "@/lib/actions/groceries";
import { scanReceipt } from "@/lib/scan-receipt";
import { useAuth } from "@/lib/auth-provider";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { formatCurrency, todayLocalDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

export interface ScannedFormLine {
  name: string;
  price: number;
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

// Turns one scanned line into a form row: if the name matches a tracked
// item (case/whitespace-insensitive) it's pre-selected, otherwise it drops
// in as a new item with the name pre-typed. Price is always kept editable.
function lineFromScan(name: string, price: number, items: ReceiptableItem[]): ReceiptLine {
  const match = items.find(
    (i) => i.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );
  return {
    key: crypto.randomUUID(),
    itemId: match ? match.id : NEW_ITEM_VALUE,
    newName: match ? "" : name,
    price: Number.isFinite(price) ? String(price) : "",
  };
}

// Seeds the form rows: from scanned receipt lines when the dialog was opened
// by "Scan receipt (AI)", otherwise three blank rows to fill in by hand.
function seedLines(
  initial: ScannedFormLine[] | null | undefined,
  items: ReceiptableItem[],
): ReceiptLine[] {
  return initial && initial.length > 0
    ? initial.map((l) => lineFromScan(l.name, l.price, items))
    : [emptyLine(), emptyLine(), emptyLine()];
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
  initialLines,
  initialDate,
  initialMerchant,
}: {
  userId: string;
  items: ReceiptableItem[];
  // When provided, the dialog is controlled by the parent (e.g. a dashboard
  // quick action) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  // Pre-fill from a scanned receipt (see GroceryReceiptActions). Re-read every
  // time the dialog opens, so a fresh scan always wins.
  initialLines?: ScannedFormLine[] | null;
  initialDate?: string | null;
  initialMerchant?: string | null;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [occurredAt, setOccurredAt] = useState(initialDate ?? todayLocalDate());
  const [store, setStore] = useState(initialMerchant ?? "");
  const [lines, setLines] = useState<ReceiptLine[]>(() => seedLines(initialLines, items));
  const [submitting, setSubmitting] = useState(false);
  // Also file the receipt total as one expense in the Groceries category, so
  // it counts toward that budget (the per-item price log never does).
  const [logExpense, setLogExpense] = useState(true);
  const fromScan = !!(initialLines && initialLines.length > 0);

  // Seed the form each time the dialog opens. This has to be an effect, not
  // just the Dialog's onOpenChange, because the parent opens it
  // programmatically after a scan and onOpenChange only fires on user action.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setOccurredAt(initialDate ?? todayLocalDate());
      setStore(initialMerchant ?? "");
      setLines(seedLines(initialLines, items));
      setLogExpense(true);
    }
    wasOpen.current = open;
  }, [open, initialLines, initialDate, initialMerchant, items]);

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
        { logExpense, merchant: store.trim() || null },
      );
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
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
          {fromScan && (
            <p className="rounded-lg bg-lime-500/10 px-3 py-2 text-xs text-lime-700 ring-1 ring-lime-500/20 dark:text-lime-300">
              Filled in from your photo — double-check each name and price before saving.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="receipt-store">Store</Label>
            <div className="relative">
              <Store className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="receipt-store"
                placeholder="e.g. SM Supermarket"
                className="pl-8"
                value={store}
                onChange={(e) => setStore(e.target.value)}
              />
            </div>
          </div>

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
                  <div className="flex flex-1 flex-col gap-1">
                    {line.itemId === NEW_ITEM_VALUE ? (
                      <>
                        <Input
                          placeholder="New item name"
                          value={line.newName}
                          onChange={(e) => updateLine(line.key, { newName: e.target.value })}
                        />
                        <button
                          type="button"
                          className="self-start text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => updateLine(line.key, { itemId: "", newName: "", price: "" })}
                        >
                          Choose an existing item instead
                        </button>
                      </>
                    ) : (
                      <Select value={line.itemId} onValueChange={(value) => selectItem(line.key, value)}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select item">
                            {(value: string | null) => {
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

          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="receipt-log-expense">Also log as an expense</Label>
              <p className="text-xs text-muted-foreground">
                Adds one {formatCurrency(total, currency)} expense in your Groceries category
                {store.trim() ? ` at ${store.trim()}` : ""}, so it counts toward that budget. The
                per-item price log doesn&rsquo;t.
              </p>
            </div>
            <Switch
              id="receipt-log-expense"
              checked={logExpense}
              onCheckedChange={setLogExpense}
            />
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

// Header actions for the Groceries page: "Scan receipt (AI)" picks a photo,
// runs it through /api/scan-receipt, then opens the receipt dialog pre-filled
// with the scanned lines; "Log receipt" opens the same dialog blank.
export function GroceryReceiptActions({
  userId,
  items,
}: {
  userId: string;
  items: ReceiptableItem[];
}) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedLines, setScannedLines] = useState<ScannedFormLine[] | null>(null);
  const [scannedDate, setScannedDate] = useState<string | null>(null);
  const [scannedMerchant, setScannedMerchant] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleScanFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file after a retry
    if (!file) return;
    if (!session?.access_token) {
      toast.error("Sign in again to scan receipts");
      return;
    }

    setScanning(true);
    try {
      const receipt = await scanReceipt(file, session.access_token);
      if (receipt.lines.length === 0) {
        toast.error("Couldn't read any items — try a clearer, straighter photo");
        return;
      }
      setScannedLines(receipt.lines.map((l) => ({ name: l.name, price: l.price })));
      setScannedDate(receipt.purchasedAt ?? null);
      setScannedMerchant(receipt.merchant ?? null);
      setOpen(true);
      toast.success(
        `Scanned ${receipt.lines.length} item${receipt.lines.length === 1 ? "" : "s"} — check them before saving`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't scan the receipt");
    } finally {
      setScanning(false);
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleScanFile}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-dashed border-lime-500/40 bg-lime-500/10 font-semibold text-lime-700 hover:border-lime-500/60 hover:bg-lime-500/15 hover:text-lime-800 dark:text-lime-300 dark:hover:bg-lime-500/15 dark:hover:text-lime-200"
        disabled={scanning}
        onClick={() => fileInputRef.current?.click()}
      >
        {scanning ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Sparkles className="size-4" />
        )}
        {scanning ? "Reading…" : "Scan receipt (AI)"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setScannedLines(null);
          setScannedDate(null);
          setScannedMerchant(null);
          setOpen(true);
        }}
      >
        <Receipt className="h-4 w-4" /> Log receipt
      </Button>
      <GroceryReceiptDialog
        userId={userId}
        items={items}
        open={open}
        onOpenChange={setOpen}
        initialLines={scannedLines}
        initialDate={scannedDate}
        initialMerchant={scannedMerchant}
      />
    </>
  );
}
