"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, MoreVertical, Plus, Tag } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/categories";
import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";
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

  // The dialog stays mounted between opens, so re-seed the form from the
  // current category each time it opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setName(category?.name ?? "");
      setColor(category?.color ?? COLORS[0]);
    }
    setOpen(next);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (category) {
      await updateCategory(userId, category.id, { name, color });
    } else {
      await createCategory(userId, { name, color });
      setName("");
      setColor(COLORS[0]);
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
                    {selected && <Check className="size-4 text-white drop-shadow-sm" />}
                  </button>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              className="w-full gap-1.5 border-none text-white shadow-md transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ backgroundColor: color }}
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
