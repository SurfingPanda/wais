"use client";

import { useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MoreVertical, Plus } from "lucide-react";
import db from "@/lib/db";
import { useAuth } from "@/lib/auth-provider";
import { createCategory, updateCategory, deleteCategory } from "@/lib/actions/categories";
import type { Category } from "@/lib/types";
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
          <CategoryDialog
            userId={userId}
            category={category}
            trigger={<DropdownMenuItem>Edit</DropdownMenuItem>}
          />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => deleteCategory(userId, category.id)}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Card>
  );
}

function CategoryDialog({
  userId,
  category,
  trigger,
}: {
  userId: string;
  category?: Category;
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? COLORS[0]);

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ?? (
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Category
            </Button>
          )
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-7 w-7 rounded-full ring-offset-2 transition"
                  style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : "none" }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">{category ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
