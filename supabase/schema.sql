-- Run this once in the Supabase SQL editor (or via `supabase db push`)
-- for a fresh project. Tables use client-generated UUIDs so records can
-- be created offline, plus updated_at/deleted_at for incremental sync.

create extension if not exists "pgcrypto";

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#6366f1',
  -- Carries unused (or overspent) budget into the next month, opt-in.
  rollover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense', 'transfer')),
  description text not null default '',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, category_id, month)
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  principal numeric(12, 2) not null check (principal >= 0),
  payment_type text not null check (payment_type in ('recurring', 'one_time')),
  monthly_payment numeric(12, 2) check (monthly_payment >= 0),
  due_day smallint check (due_day between 1 and 31),
  due_date date,
  category_id uuid references public.categories(id) on delete set null,
  -- Days before the due date to send a push reminder. Null disables it.
  reminder_days_before smallint check (reminder_days_before between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('cash', 'checking', 'savings', 'debit_card', 'credit_card', 'other')),
  starting_balance numeric(12, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  description text not null default '',
  frequency text not null check (frequency in ('weekly', 'monthly')),
  day_of_month smallint check (day_of_month between 1 and 31),
  weekday smallint check (weekday between 0 and 6),
  start_date date not null,
  end_date date,
  last_generated_date date,
  -- Days before the next occurrence to send a push reminder. Null disables it.
  reminder_days_before smallint check (reminder_days_before between 0 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount >= 0),
  target_date date,
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  -- Manual restock cadence override, in days. Null lets the client learn it
  -- from purchase history instead.
  restock_interval_days smallint check (restock_interval_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- A logged grocery purchase — just the price paid and when, against an
-- item. Deliberately separate from transactions: it's a price/restock
-- record, not an expense, so it never touches accounts, budgets, or
-- categories.
create table if not exists public.grocery_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grocery_item_id uuid not null references public.grocery_items(id) on delete cascade,
  price numeric(12, 2) not null check (price >= 0),
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One row per subscribed browser/device. Not part of the offline sync
-- pipeline (see src/lib/sync.ts) — written directly by the client via
-- supabase-js, and read by the reminder cron job with the service-role key.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- Households group people who share one set of finances. Every financial
-- table carries a household_id (see the alter block below); RLS scopes rows
-- by household membership. See supabase/migrations/2026-08-29-households.sql
-- for the full rollout notes and the backfill.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Household',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_invites (
  code text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists household_members_user_idx on public.household_members (user_id);
create index if not exists household_members_household_idx on public.household_members (household_id);
create index if not exists household_invites_household_idx on public.household_invites (household_id);

-- Links an expense transaction to the loan it pays down.
alter table public.transactions
  add column if not exists loan_id uuid references public.loans(id) on delete set null;

-- Links an expense transaction to the savings goal it contributes to.
alter table public.transactions
  add column if not exists goal_id uuid references public.savings_goals(id) on delete set null;

-- Links a transaction to the account its money moved in/out of. For
-- transfers, this is the source account.
alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

-- Transfers only — the destination account. Never set for income/expense.
alter table public.transactions
  add column if not exists to_account_id uuid references public.accounts(id) on delete set null;

-- Links an expense transaction to the grocery item it's a logged purchase of.
alter table public.transactions
  add column if not exists grocery_item_id uuid references public.grocery_items(id) on delete set null;

-- Marks a transaction created by account reconciliation (an adjustment for
-- the gap between the computed balance and a real statement balance).
alter table public.transactions
  add column if not exists is_adjustment boolean not null default false;

-- The household each financial row belongs to. Nullable during the rollout
-- (see the households migration); a BEFORE INSERT trigger stamps it from the
-- writer's membership, and RLS falls back to user_id while it's null.
alter table public.categories             add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.transactions           add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.budgets                add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.loans                  add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.accounts               add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.recurring_transactions add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.savings_goals          add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.grocery_items          add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.grocery_purchases      add column if not exists household_id uuid references public.households(id) on delete cascade;

create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);
create index if not exists transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index if not exists budgets_user_updated_idx on public.budgets (user_id, updated_at);
create index if not exists loans_user_updated_idx on public.loans (user_id, updated_at);
create index if not exists accounts_user_updated_idx on public.accounts (user_id, updated_at);
create index if not exists recurring_transactions_user_updated_idx on public.recurring_transactions (user_id, updated_at);
create index if not exists savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at);
create index if not exists grocery_items_user_updated_idx on public.grocery_items (user_id, updated_at);
create index if not exists grocery_purchases_user_updated_idx on public.grocery_purchases (user_id, updated_at);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create index if not exists categories_household_updated_idx             on public.categories (household_id, updated_at);
create index if not exists transactions_household_updated_idx           on public.transactions (household_id, updated_at);
create index if not exists budgets_household_updated_idx                on public.budgets (household_id, updated_at);
create index if not exists loans_household_updated_idx                  on public.loans (household_id, updated_at);
create index if not exists accounts_household_updated_idx               on public.accounts (household_id, updated_at);
create index if not exists recurring_transactions_household_updated_idx on public.recurring_transactions (household_id, updated_at);
create index if not exists savings_goals_household_updated_idx          on public.savings_goals (household_id, updated_at);
create index if not exists grocery_items_household_updated_idx          on public.grocery_items (household_id, updated_at);
create index if not exists grocery_purchases_household_updated_idx      on public.grocery_purchases (household_id, updated_at);

-- Always stamp updated_at server-side on write. The client never sets it,
-- which keeps last-write-wins conflict resolution based on one clock.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger loans_set_updated_at before update on public.loans
  for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();
create trigger recurring_transactions_set_updated_at before update on public.recurring_transactions
  for each row execute function public.set_updated_at();
create trigger savings_goals_set_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();
create trigger grocery_items_set_updated_at before update on public.grocery_items
  for each row execute function public.set_updated_at();
create trigger grocery_purchases_set_updated_at before update on public.grocery_purchases
  for each row execute function public.set_updated_at();
create or replace trigger households_set_updated_at before update on public.households
  for each row execute function public.set_updated_at();
create or replace trigger household_members_set_updated_at before update on public.household_members
  for each row execute function public.set_updated_at();

-- Household membership helpers. SECURITY DEFINER so policies on
-- household_members itself can call them without recursing.
create or replace function public.is_household_member(hid uuid)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean language sql security definer stable set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- The creator of a household is automatically its owner.
create or replace function public.add_household_creator()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (household_id, user_id) do nothing;
  return new;
end;
$$;

create or replace trigger households_add_creator after insert on public.households
  for each row execute function public.add_household_creator();

-- Stamps household_id on a new financial row from the caller's membership
-- when the client didn't set one; leaves it null if they have no household
-- (RLS then falls back to user_id).
create or replace function public.stamp_household_id()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.household_id is null then
    select m.household_id into new.household_id
    from public.household_members m
    where m.user_id = auth.uid()
    order by m.joined_at asc
    limit 1;
  end if;
  return new;
end;
$$;

create or replace trigger categories_stamp_household             before insert on public.categories             for each row execute function public.stamp_household_id();
create or replace trigger transactions_stamp_household           before insert on public.transactions           for each row execute function public.stamp_household_id();
create or replace trigger budgets_stamp_household                before insert on public.budgets                for each row execute function public.stamp_household_id();
create or replace trigger loans_stamp_household                  before insert on public.loans                  for each row execute function public.stamp_household_id();
create or replace trigger accounts_stamp_household               before insert on public.accounts               for each row execute function public.stamp_household_id();
create or replace trigger recurring_transactions_stamp_household before insert on public.recurring_transactions for each row execute function public.stamp_household_id();
create or replace trigger savings_goals_stamp_household          before insert on public.savings_goals          for each row execute function public.stamp_household_id();
create or replace trigger grocery_items_stamp_household          before insert on public.grocery_items          for each row execute function public.stamp_household_id();
create or replace trigger grocery_purchases_stamp_household      before insert on public.grocery_purchases      for each row execute function public.stamp_household_id();

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.loans enable row level security;
alter table public.accounts enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.savings_goals enable row level security;
alter table public.grocery_items enable row level security;
alter table public.grocery_purchases enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

-- Financial tables: visible/writable to every member of the row's household,
-- with a fallback to the row's own user_id while household_id is still null
-- (during the rollout, and for brand-new users with no household yet).
do $$
declare t text;
begin
  foreach t in array array[
    'categories','transactions','budgets','loans','accounts',
    'recurring_transactions','savings_goals','grocery_items','grocery_purchases'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_access', t);
    execute format($f$
      create policy %I on public.%I
        for all
        using (
          (household_id is not null and public.is_household_member(household_id))
          or (household_id is null and auth.uid() = user_id)
        )
        with check (
          (household_id is not null and public.is_household_member(household_id))
          or (household_id is null and auth.uid() = user_id)
        )
    $f$, t || '_access', t);
  end loop;
end;
$$;

create policy "push_subscriptions_owner" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Households / members / invites.
drop policy if exists "households_select" on public.households;
create policy "households_select" on public.households
  for select using (public.is_household_member(id));
drop policy if exists "households_insert" on public.households;
create policy "households_insert" on public.households
  for insert with check (created_by = auth.uid());
drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update using (public.is_household_owner(id)) with check (public.is_household_member(id));
drop policy if exists "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (public.is_household_owner(id));

drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (public.is_household_member(household_id));
drop policy if exists "household_members_delete" on public.household_members;
create policy "household_members_delete" on public.household_members
  for delete using (user_id = auth.uid() or public.is_household_owner(household_id));

drop policy if exists "household_invites_select" on public.household_invites;
create policy "household_invites_select" on public.household_invites
  for select using (public.is_household_member(household_id));
drop policy if exists "household_invites_insert" on public.household_invites;
create policy "household_invites_insert" on public.household_invites
  for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
drop policy if exists "household_invites_delete" on public.household_invites;
create policy "household_invites_delete" on public.household_invites
  for delete using (public.is_household_member(household_id));

-- RPCs the invite / join / leave UI calls.
create or replace function public.create_household(household_name text default 'My household')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare hid uuid;
begin
  insert into public.households (name, created_by)
  values (coalesce(nullif(btrim(household_name), ''), 'My household'), auth.uid())
  returning id into hid;
  return hid;
end;
$$;

create or replace function public.create_household_invite(hid uuid)
returns text language plpgsql security definer set search_path = public, pg_temp as $$
declare c text;
begin
  if not public.is_household_member(hid) then
    raise exception 'Not a member of this household';
  end if;
  c := upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 8));
  insert into public.household_invites (code, household_id, created_by, expires_at)
  values (c, hid, auth.uid(), now() + interval '7 days');
  return c;
end;
$$;

create or replace function public.redeem_household_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare inv public.household_invites%rowtype;
begin
  select * into inv from public.household_invites where code = invite_code;
  if inv.code is null then raise exception 'Invite not found'; end if;
  if inv.expires_at < now() then raise exception 'Invite has expired'; end if;
  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;
  return inv.household_id;
end;
$$;

create or replace function public.leave_household(hid uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.household_members where household_id = hid) <= 1 then
    raise exception 'You are the only member — delete the household instead';
  end if;
  delete from public.household_members where household_id = hid and user_id = auth.uid();
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.redeem_household_invite(text) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
