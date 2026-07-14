-- Adds recurring transactions (salary, rent, subscriptions, etc.) on an
-- existing database that already ran schema.sql and prior migrations.
-- Safe to run once in the Supabase SQL editor.

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists recurring_transactions_user_updated_idx on public.recurring_transactions (user_id, updated_at);

create or replace trigger recurring_transactions_set_updated_at before update on public.recurring_transactions
  for each row execute function public.set_updated_at();

alter table public.recurring_transactions enable row level security;

drop policy if exists "recurring_transactions_owner" on public.recurring_transactions;
create policy "recurring_transactions_owner" on public.recurring_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
