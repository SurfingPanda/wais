-- Adds account-to-account transfers on an existing database that already
-- ran schema.sql and prior migrations. Safe to run once in the Supabase
-- SQL editor.

-- Postgres check constraints can't be altered in place — drop and recreate
-- with 'transfer' added. The name matches Postgres's default
-- <table>_<column>_check naming for an inline column check.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions
  add constraint transactions_type_check check (type in ('income', 'expense', 'transfer'));

-- Transfers only — the destination account. account_id (already present)
-- becomes the source account for a transfer row.
alter table public.transactions
  add column if not exists to_account_id uuid references public.accounts(id) on delete set null;
