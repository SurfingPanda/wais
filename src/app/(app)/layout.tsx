"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  ArrowLeftRight,
  Coins,
  HandCoins,
  LayoutDashboard,
  LogOut,
  PiggyBank,
  Tag,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import { supabase } from "@/lib/supabase";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import { SyncIndicator } from "@/components/sync-indicator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/loans", label: "Loans", icon: HandCoins },
  { href: "/categories", label: "Categories", icon: Tag },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
              <Wallet className="size-3.5" />
            </span>
            <span className="text-sm font-semibold">Budgeting</span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent",
                  pathname === link.href
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-1">
            <SyncIndicator />
            <ProfileMenu email={user.email ?? null} />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                  active ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function ProfileMenu({ email }: { email: string | null }) {
  const { currency, setCurrency } = useCurrency();
  const initial = (email?.[0] ?? "?").toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-accent md:rounded-md md:pr-2"
            aria-label="Account menu"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-semibold text-white">
              {initial}
            </span>
            <span className="hidden max-w-44 truncate text-sm font-medium md:inline">
              {email ?? "Account"}
            </span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-52">
        <div className="px-1.5 py-1.5">
          <p className="truncate text-sm font-medium">{email ?? "Account"}</p>
          <p className="text-xs text-muted-foreground">Signed in</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Coins className="size-4" /> Currency
            <span className="ml-auto pr-1 text-xs text-muted-foreground">{currency}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={currency} onValueChange={(value) => setCurrency(value as string)}>
              {CURRENCIES.map((c) => (
                <DropdownMenuRadioItem key={c.code} value={c.code}>
                  <span className="w-6 shrink-0 text-muted-foreground">{c.symbol}</span>
                  {c.code}
                  <span className="ml-auto pl-3 text-xs text-muted-foreground">{c.label}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => supabase.auth.signOut()}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
