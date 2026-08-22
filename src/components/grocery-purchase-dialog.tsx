"use client";

import { useState, type FormEvent } from "react";
import { Calendar, ShoppingBasket } from "lucide-react";
import { recordGroceryPurchase } from "@/lib/actions/groceries";
import { useCurrency, CURRENCIES } from "@/lib/currency";
import { todayLocalDate } from "@/lib/format";
import type { GroceryItem } from "@/lib/types";
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

// Recording a price here is what actually restocks an item — restock
// timing is computed from its price history (see grocery-restock.ts), not
// stored on the item itself.
export function GroceryPurchaseDialog({
  userId,
  item,
  lastPrice,
}: {
  userId: string;
  item: GroceryItem;
  lastPrice: number | null;
}) {
  const { currency } = useCurrency();
  const currencySymbol = CURRENCIES.find((c) => c.code === currency)?.symbol ?? "";
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(lastPrice !== null ? String(lastPrice) : "");
  const [occurredAt, setOccurredAt] = useState(todayLocalDate());

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await recordGroceryPurchase(userId, item, Number(price), new Date(occurredAt).toISOString());
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPrice(lastPrice !== null ? String(lastPrice) : "");
          setOccurredAt(todayLocalDate());
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <ShoppingBasket className="h-4 w-4" /> Price
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime-500/10 ring-1 ring-lime-500/20">
              <ShoppingBasket className="size-4 text-lime-600 dark:text-lime-400" />
            </span>
            <DialogTitle>Price · {item.name}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="grocery-price">Price</Label>
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-input bg-lime-500/10 px-4 py-4 ring-1 ring-lime-500/20">
              <span className="text-2xl font-semibold text-lime-600 dark:text-lime-400">
                {currencySymbol}
              </span>
              <Input
                id="grocery-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-auto w-full border-0 bg-transparent p-0 text-center text-3xl font-bold text-lime-700 tabular-nums shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0 dark:text-lime-400"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grocery-date">Date</Label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="grocery-date"
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
              className="w-full gap-1.5 border-none bg-gradient-to-r from-lime-500 to-green-600 text-white shadow-md shadow-lime-500/25 transition-all hover:from-lime-600 hover:to-green-700 active:scale-[0.98]"
            >
              <ShoppingBasket className="size-4" />
              Save price
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
