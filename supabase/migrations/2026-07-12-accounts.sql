-- Adds accounts (Cash, Debit Card, Credit Card, etc.) on an existing
-- database that already ran schema.sql and prior migrations. Safe to run
-- once in the Supabase SQL editor.

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

alter table public.transactions
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists accounts_user_updated_idx on public.accounts (user_id, updated_at);

create or replace trigger accounts_set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;

drop policy if exists "accounts_owner" on public.accounts;
create policy "accounts_owner" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
