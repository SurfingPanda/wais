-- Adds explicit refund metadata for auditable account history.

alter table public.transactions
  add column if not exists is_refund boolean not null default false;
