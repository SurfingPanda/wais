-- Adds an optional default account for loan payments.
-- Safe to run on existing databases and preserves existing loans.

alter table public.loans
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists loans_account_idx on public.loans (account_id);
