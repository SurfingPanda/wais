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

create index if not exists categories_user_updated_idx on public.categories (user_id, updated_at);
create index if not exists transactions_user_updated_idx on public.transactions (user_id, updated_at);
create index if not exists budgets_user_updated_idx on public.budgets (user_id, updated_at);
create index if not exists loans_user_updated_idx on public.loans (user_id, updated_at);
create index if not exists accounts_user_updated_idx on public.accounts (user_id, updated_at);
create index if not exists recurring_transactions_user_updated_idx on public.recurring_transactions (user_id, updated_at);
create index if not exists savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at);

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

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.loans enable row level security;
alter table public.accounts enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.savings_goals enable row level security;

create policy "categories_owner" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "transactions_owner" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "budgets_owner" on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "loans_owner" on public.loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "accounts_owner" on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_transactions_owner" on public.recurring_transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "savings_goals_owner" on public.savings_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
