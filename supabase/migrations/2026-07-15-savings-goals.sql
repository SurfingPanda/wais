-- Adds the savings goals feature to an existing database that already ran
-- the original schema.sql. Safe to run once in the Supabase SQL editor.

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

alter table public.transactions
  add column if not exists goal_id uuid references public.savings_goals(id) on delete set null;

create index if not exists savings_goals_user_updated_idx on public.savings_goals (user_id, updated_at);

create or replace trigger savings_goals_set_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

alter table public.savings_goals enable row level security;

drop policy if exists "savings_goals_owner" on public.savings_goals;
create policy "savings_goals_owner" on public.savings_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
