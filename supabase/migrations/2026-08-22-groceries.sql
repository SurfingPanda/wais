-- Adds the grocery tracker feature to an existing database that already ran
-- the original schema.sql. Safe to run once in the Supabase SQL editor.

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

alter table public.transactions
  add column if not exists grocery_item_id uuid references public.grocery_items(id) on delete set null;

create index if not exists grocery_items_user_updated_idx on public.grocery_items (user_id, updated_at);

create or replace trigger grocery_items_set_updated_at before update on public.grocery_items
  for each row execute function public.set_updated_at();

alter table public.grocery_items enable row level security;

drop policy if exists "grocery_items_owner" on public.grocery_items;
create policy "grocery_items_owner" on public.grocery_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
