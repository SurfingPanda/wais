"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  Bell,
  BellOff,
  Coins,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Monitor,
  Moon,
  MoreHorizontal,
  PiggyBank,
  ShoppingBasket,
  Sun,
  Tag,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth-provider";
import { supabase } from "@/lib/supabase";
import db from "@/lib/db";
import { CURRENCIES, useCurrency } from "@/lib/currency";
import { setThemeWithTransition } from "@/lib/theme-transition";
import {
  isPushSupported,
  getExistingSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";
import { SyncIndicator } from "@/components/sync-indicator";
import { ConflictIndicator } from "@/components/conflict-indicator";
import { Button } from "@/components/ui/button";
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
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Landmark },
  { href: "/loans", label: "Loans", icon: HandCoins },
  { href: "/budgets", label: "Budgets", icon: PiggyBank },
  { href: "/groceries", label: "Groceries", icon: ShoppingBasket },
];

// The bottom tab bar only has room for so many labeled items — the rest
// live behind "More" so labels don't collide on narrow phones.
const MOBILE_TAB_COUNT = 4;
const MOBILE_PRIMARY_LINKS = NAV_LINKS.slice(0, MOBILE_TAB_COUNT);
const MOBILE_MORE_LINKS = NAV_LINKS.slice(MOBILE_TAB_COUNT);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const onboarded = !!user?.user_metadata?.onboarded;
  const categoryCount = useLiveQuery(
    () =>
      user
        ? db.categories.filter((c) => !c.deleted_at).count()
        : Promise.resolve(0),
    [user?.id],
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (onboarded) return;
    if (categoryCount === 0) {
      // Brand-new account with nothing set up — run the first-run wizard.
      router.replace("/onboarding");
    } else if (categoryCount && categoryCount > 0) {
      // Account predates onboarding: it already has data, so mark it done
      // rather than send an existing user through the wizard.
      void supabase.auth.updateUser({ data: { onboarded: true } });
    }
  }, [loading, user, onboarded, categoryCount, router]);

  // Hold the app chrome back until we know a not-yet-onboarded user isn't
  // about to be sent to the wizard — avoids a flash of the empty dashboard.
  const resolvingOnboarding = !onboarded && (categoryCount === undefined || categoryCount === 0);

  if (loading || !user || resolvingOnboarding) {
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
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 text-[11px] font-extrabold text-white">
              W
            </span>
            <span className="text-sm font-semibold">Wais</span>
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
            <ConflictIndicator />
            <SyncIndicator />
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={<Link href="/owlie" />}
              aria-label="Ask Owlie"
            >
              <MessageCircle className="size-4" />
            </Button>
            <ProfileMenu
              userId={user.id}
              email={user.email ?? null}
              name={
                typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
                  ? user.user_metadata.full_name.trim()
                  : null
              }
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-24 md:pb-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-3xl items-stretch justify-around">
          {MOBILE_PRIMARY_LINKS.map((link) => {
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
          {MOBILE_MORE_LINKS.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                      MOBILE_MORE_LINKS.some((l) => l.href === pathname)
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-muted-foreground",
                    )}
                  >
                    <MoreHorizontal className="size-5" />
                    More
                  </button>
                }
              />
              <DropdownMenuContent side="top" align="end">
                {MOBILE_MORE_LINKS.map((link) => {
                  const Icon = link.icon;
                  return (
                    <DropdownMenuItem key={link.href} render={<Link href={link.href} />}>
                      <Icon className="size-4" /> {link.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </nav>
    </div>
  );
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

function ProfileMenu({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string | null;
  name: string | null;
}) {
  const { currency, setCurrency } = useCurrency();
  const { theme = "system", setTheme } = useTheme();
  const lastClick = useRef({ x: 0, y: 0 });
  const label = name ?? email ?? "Account";
  const initial = (name?.[0] ?? email?.[0] ?? "?").toUpperCase();
  const ThemeIcon = THEMES.find((t) => t.value === theme)?.icon ?? Monitor;

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
              {label}
            </span>
          </button>
        }
      />
      <DropdownMenuContent align="end" className="min-w-52">
        <div className="px-1.5 py-1.5">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="truncate text-xs text-muted-foreground">{email ?? "Signed in"}</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />}>
          <User className="size-4" /> Edit profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/categories" />}>
          <Tag className="size-4" /> Categories
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/household" />}>
          <Users className="size-4" /> Household
        </DropdownMenuItem>
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ThemeIcon className="size-4" /> Theme
            <span className="ml-auto pr-1 text-xs text-muted-foreground capitalize">{theme}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent
            onPointerDown={(e) => {
              lastClick.current = { x: e.clientX, y: e.clientY };
            }}
          >
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(value) =>
                setThemeWithTransition(setTheme, value as string, lastClick.current)
              }
            >
              {THEMES.map((t) => (
                <DropdownMenuRadioItem key={t.value} value={t.value}>
                  <t.icon className="size-4 text-muted-foreground" />
                  {t.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <PushReminderMenuItem userId={userId} />
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => supabase.auth.signOut()}>
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PushReminderMenuItem({ userId }: { userId: string }) {
  const [subscribed, setSubscribed] = useState(false);
  const [supported] = useState(() => isPushSupported());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    getExistingSubscription().then((sub) => setSubscribed(!!sub));
  }, [supported]);

  async function toggle() {
    setBusy(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        await subscribeToPush(userId);
        setSubscribed(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update push reminders");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <DropdownMenuItem disabled={busy} onClick={toggle}>
      {subscribed ? <BellOff className="size-4" /> : <Bell className="size-4" />}
      {subscribed ? "Disable push reminders" : "Enable push reminders"}
    </DropdownMenuItem>
  );
}
