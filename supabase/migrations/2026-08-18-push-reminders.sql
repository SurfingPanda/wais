-- Days before a loan's due date / a recurring transaction's next occurrence
-- to send a push reminder. Null disables it.
alter table public.loans
  add column if not exists reminder_days_before smallint check (reminder_days_before between 0 and 30);

alter table public.recurring_transactions
  add column if not exists reminder_days_before smallint check (reminder_days_before between 0 and 30);

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

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_owner" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
