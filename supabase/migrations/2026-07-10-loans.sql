-- Adds the loans feature to an existing database that already ran the
-- original schema.sql. Safe to run once in the Supabase SQL editor.

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  principal numeric(12, 2) not null check (principal >= 0),
  payment_type text not null check (payment_type in ('recurring', 'one_time')),
  monthly_payment numeric(12, 2) check (monthly_payment >= 0),
  category_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.transactions
  add column if not exists loan_id uuid references public.loans(id) on delete set null;

create index if not exists loans_user_updated_idx on public.loans (user_id, updated_at);

create or replace trigger loans_set_updated_at before update on public.loans
  for each row execute function public.set_updated_at();

alter table public.loans enable row level security;

drop policy if exists "loans_owner" on public.loans;
create policy "loans_owner" on public.loans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
