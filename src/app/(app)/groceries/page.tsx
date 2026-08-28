"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  MoreVertical,
  Plus,
  ShoppingBasket,
  Tag,
} from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import {
  createGroceryItem,
  updateGroceryItem,
  deleteGroceryItem,
  type GroceryItemInput,
} from "@/lib/actions/groceries";
import { useCurrency } from "@/lib/currency";
import { formatCurrency, shortDateLabel, todayLocalDate } from "@/lib/format";
import {
  computeRestockInfo,
  needsRestock,
  sortByUrgency,
  type RestockInfo,
} from "@/lib/grocery-restock";
import type { GroceryItem, GroceryPurchase } from "@/lib/types";
import { GroceryPurchaseDialog } from "@/components/grocery-purchase-dialog";
import { GroceryReceiptActions } from "@/components/grocery-receipt-dialog";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ITEMS_PER_PAGE = 7;

export default function GroceriesPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);

  const items = useLiveQuery(
    () =>
      user
        ? db.grocery_items.where("user_id").equals(user.id).filter((i) => !i.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const purchases = useLiveQuery(
    () =>
      user
        ? db.grocery_purchases.where("user_id").equals(user.id).filter((p) => !p.deleted_at).toArray()
        : [],
    [user?.id],
  );

  const purchasesByItem = useMemo(() => {
    const map = new Map<string, GroceryPurchase[]>();
    for (const p of purchases ?? []) {
      const list = map.get(p.grocery_item_id);
      if (list) list.push(p);
      else map.set(p.grocery_item_id, [p]);
    }
    return map;
  }, [purchases]);

  const today = todayLocalDate();

  const withRestockInfo = useMemo(() => {
    return (items ?? []).map((item) => ({
      item,
      info: computeRestockInfo(item, purchasesByItem.get(item.id) ?? [], today),
    }));
  }, [items, purchasesByItem, today]);

  const suggestions = useMemo(
    () => sortByUrgency(withRestockInfo.filter(({ info }) => needsRestock(info))),
    [withRestockInfo],
  );

  // Most due-for-restock items surface first, so page 1 is the most
  // actionable one even before you start clicking through the rest.
  const sortedItems = useMemo(() => sortByUrgency(withRestockInfo), [withRestockInfo]);
  const pageCount = Math.max(1, Math.ceil(sortedItems.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedItems = sortedItems.slice(
    (safePage - 1) * ITEMS_PER_PAGE,
    safePage * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Groceries</h1>
          {suggestions.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {suggestions.length} item{suggestions.length === 1 ? "" : "s"} due to restock
            </p>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-1.5">
            <GroceryReceiptActions
              userId={user.id}
              items={withRestockInfo.map(({ item, info }) => ({
                id: item.id,
                name: item.name,
                lastPrice: info.lastPrice,
              }))}
            />
            <ItemDialog userId={user.id} />
          </div>
        )}
      </div>

      {user && suggestions.length > 0 && (
        <RestockSuggestions userId={user.id} suggestions={suggestions} />
      )}

      <div className="space-y-3">
        {user &&
          pagedItems.map(({ item, info }) => (
            <ItemCard key={item.id} userId={user.id} item={item} info={info} />
          ))}
        {items?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No groceries tracked yet. Add an item and log what you paid for it — after a couple of
            purchases, Wais learns how often you buy it and suggests when to restock.
          </p>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {safePage} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function RestockSuggestions({
  userId,
  suggestions,
}: {
  userId: string;
  suggestions: { item: GroceryItem; info: RestockInfo }[];
}) {
  const { currency } = useCurrency();
  const top = suggestions[0];
  const overdueCount = suggestions.filter((s) => s.info.status === "overdue").length;

  return (
    <Card className="space-y-3 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <ShoppingBasket className="size-4 text-lime-600 dark:text-lime-400" />
        <h2 className="text-sm font-medium">Time to restock</h2>
      </div>
      <OwlieTip tone={overdueCount > 0 ? "warning" : "info"} size="sm" tail mascot>
        {overdueCount > 0
          ? `${top.item.name}${suggestions.length > 1 ? ` and ${suggestions.length - 1} other${suggestions.length > 2 ? "s" : ""}` : ""} ${suggestions.length > 1 ? "look" : "looks"} overdue for a restock.`
          : `${top.item.name} is coming up on its usual restock time.`}
      </OwlieTip>
      <div className="space-y-2">
        {suggestions.map(({ item, info }) => (
          <div
            key={item.id}
            className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{item.name}</span>
                <Badge
                  variant={info.status === "overdue" ? "destructive" : "secondary"}
                  className="gap-1"
                >
                  {info.status === "overdue" ? (
                    <AlertTriangle className="size-3" />
                  ) : (
                    <Clock className="size-3" />
                  )}
                  {info.status === "overdue" ? "Overdue" : "Due soon"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Last bought {info.lastPurchasedAt ? shortDateLabel(info.lastPurchasedAt) : "—"}
                {info.lastPrice !== null ? ` · ${formatCurrency(info.lastPrice, currency)}` : ""}
              </p>
            </div>
            <GroceryPurchaseDialog userId={userId} item={item} lastPrice={info.lastPrice} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function ItemCard({
  userId,
  item,
  info,
}: {
  userId: string;
  item: GroceryItem;
  info: RestockInfo;
}) {
  const { currency } = useCurrency();
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="space-y-2.5 px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <span className="truncate text-sm font-medium">{item.name}</span>
          <p className="text-xs text-muted-foreground">
            {info.purchaseCount === 0
              ? "No purchases logged yet"
              : `Last bought ${shortDateLabel(info.lastPurchasedAt!)}${
                  info.lastPrice !== null ? ` · ${formatCurrency(info.lastPrice, currency)}` : ""
                }`}
            {info.purchaseCount > 0 &&
              ` · every ~${info.intervalDays}d${item.restock_interval_days ? " (manual)" : ""}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <GroceryPurchaseDialog userId={userId} item={item} lastPrice={info.lastPrice} />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>Edit</DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onClick={() => deleteGroceryItem(userId, item.id)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ItemDialog userId={userId} item={item} open={editOpen} onOpenChange={setEditOpen} />
        </div>
      </div>
    </Card>
  );
}

function ItemDialog({
  userId,
  item,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  item?: GroceryItem;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [name, setName] = useState(item?.name ?? "");
  const [intervalDays, setIntervalDays] = useState(
    item?.restock_interval_days ? String(item.restock_interval_days) : "",
  );

  function handleOpenChange(next: boolean) {
    if (next) {
      setName(item?.name ?? "");
      setIntervalDays(item?.restock_interval_days ? String(item.restock_interval_days) : "");
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const input: GroceryItemInput = {
      name,
      restock_interval_days: intervalDays ? Number(intervalDays) : null,
    };

    if (item) {
      await updateGroceryItem(userId, item.id, input);
    } else {
      await createGroceryItem(userId, input);
      setName("");
      setIntervalDays("");
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Item
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-lime-500/10 ring-1 ring-lime-500/20">
              <ShoppingBasket className="size-4 text-lime-600 dark:text-lime-400" />
            </span>
            <DialogTitle>{item ? "Edit item" : "New grocery item"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="grocery-name">Name</Label>
            <div className="relative">
              <ShoppingBasket className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="grocery-name"
                required
                placeholder="e.g. Rice"
                className="pl-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grocery-interval">Restock every (days, optional)</Label>
            <div className="relative">
              <Tag className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="grocery-interval"
                type="number"
                inputMode="numeric"
                min="1"
                placeholder="Learn automatically"
                className="pl-8"
                value={intervalDays}
                onChange={(e) => setIntervalDays(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Leave blank to let Wais learn your buying pattern from purchase history (starting
              with a 14-day guess until there&rsquo;s enough history).
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full gap-1.5 border-none bg-gradient-to-r from-lime-500 to-green-600 text-white shadow-md shadow-lime-500/25 transition-all hover:from-lime-600 hover:to-green-700 active:scale-[0.98]"
            >
              {item ? <Check className="size-4" /> : <Plus className="size-4" />}
              {item ? "Save changes" : "Add item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
