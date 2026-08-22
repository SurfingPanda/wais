-- Adds a dedicated grocery_purchases table, so logging a grocery purchase
-- only ever records a price/date against the item — it no longer creates a
-- real expense transaction (that behavior is being removed; see the app
-- code change in the same commit). Safe to run once in the Supabase SQL
-- editor.

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

create index if not exists grocery_purchases_user_updated_idx on public.grocery_purchases (user_id, updated_at);

create or replace trigger grocery_purchases_set_updated_at before update on public.grocery_purchases
  for each row execute function public.set_updated_at();

alter table public.grocery_purchases enable row level security;

drop policy if exists "grocery_purchases_owner" on public.grocery_purchases;
create policy "grocery_purchases_owner" on public.grocery_purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
