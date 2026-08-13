"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, MoreVertical, Plus, Repeat, Tag } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/categories";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";

const COLORS = [
  "#6366f1", "#22c55e", "#ef4444", "#f59e0b",
  "#06b6d4", "#ec4899", "#8b5cf6", "#64748b",
];

// White text fails WCAG AA against most of the swatches above (e.g. the
// amber and green ones) — pick whichever of white/near-black has the higher
// contrast ratio against the given color instead of assuming white.
function readableTextColor(hex: string): string {
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = toLinear(parseInt(hex.slice(1, 3), 16) / 255);
  const g = toLinear(parseInt(hex.slice(3, 5), 16) / 255);
  const b = toLinear(parseInt(hex.slice(5, 7), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithBlack = (luminance + 0.05) / 0.05;
  // True black, not a dark gray/slate — a lighter "near-black" scores lower
  // contrast on hue-adjacent colors (e.g. indigo, violet) and can slip below
  // the WCAG AA 4.5:1 threshold those swatches otherwise clear.
  return contrastWithWhite >= contrastWithBlack ? "#ffffff" : "#000000";
}

export default function CategoriesPage() {
  const { user } = useAuth();
  const categories = useLiveQuery(
    () =>
      user
        ? db.categories.where("user_id").equals(user.id).filter((c) => !c.deleted_at).toArray()
        : [],
    [user?.id],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Categories</h1>
        {user && <CategoryDialog userId={user.id} />}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {categories?.map((category) => (
          <CategoryRow key={category.id} userId={user!.id} category={category} />
        ))}
        {categories?.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet. Add your first one.</p>
        )}
      </div>
    </div>
  );
}

function CategoryRow({ userId, category }: { userId: string; category: Category }) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <Card className="flex flex-row items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: category.color }}
          aria-hidden
        />
        <span className="text-sm font-medium">{category.name}</span>
        {category.rollover && (
          <span
            title="Unused budget rolls over to next month"
            className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
          >
            <Repeat className="size-2.5" /> Rollover
          </span>
        )}
      </div>
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
          <DropdownMenuItem
            variant="destructive"
            onClick={() => deleteCategory(userId, category.id)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryDialog
        userId={userId}
        category={category}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </Card>
  );
}

function CategoryDialog({
  userId,
  category,
  open: controlledOpen,
  onOpenChange,
}: {
  userId: string;
  category?: Category;
  // When provided, the dialog is controlled by the parent (e.g. opened from
  // a menu item) and renders no trigger of its own.
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [rollover, setRollover] = useState(category?.rollover ?? false);

  // The dialog stays mounted between opens, so re-seed the form from the
  // current category each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(category?.name ?? "");
      setColor(category?.color ?? COLORS[0]);
      setRollover(category?.rollover ?? false);
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (category) {
      await updateCategory(userId, category.id, { name, color, rollover });
    } else {
      await createCategory(userId, { name, color, rollover });
      setName("");
      setColor(COLORS[0]);
      setRollover(false);
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {controlledOpen === undefined && (
        <DialogTrigger
          render={
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Category
            </Button>
          }
        />
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 transition-colors"
              style={{ backgroundColor: `${color}1a`, boxShadow: `inset 0 0 0 1px ${color}33` }}
            >
              <Tag className="size-4" style={{ color }} />
            </span>
            <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
          </div>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <div className="relative">
              <span
                className="pointer-events-none absolute top-1/2 left-2.5 size-2.5 -translate-y-1/2 rounded-full"
                style={{ backgroundColor: color }}
              />
              <Input
                id="category-name"
                required
                placeholder="e.g. Groceries"
                className="pl-8"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2.5">
              {COLORS.map((c) => {
                const selected = color === c;
                return (
                  <button
                    type="button"
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={c}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full ring-2 ring-offset-2 ring-offset-popover transition-all",
                      selected ? "scale-110 ring-foreground/60" : "ring-transparent hover:scale-105",
                    )}
                    style={{ backgroundColor: c }}
                  >
                    {selected && (
                      <Check className="size-4" style={{ color: readableTextColor(c) }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="category-rollover">Roll over unused budget</Label>
              <p className="text-xs text-muted-foreground">
                Money left in this category at month&apos;s end carries into the next month instead
                of resetting. Overspending carries over too, reducing next month&apos;s budget.
              </p>
            </div>
            <Switch id="category-rollover" checked={rollover} onCheckedChange={setRollover} />
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full gap-1.5 border-none shadow-md transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: color, color: readableTextColor(color) }}
            >
              {category ? <Check className="size-4" /> : <Plus className="size-4" />}
              {category ? "Save changes" : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
