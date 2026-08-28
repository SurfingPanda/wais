-- Account reconciliation: entering a real statement balance books an
-- "adjustment" transaction for the difference between it and the balance Wais
-- computes, so the computed balance matches from then on. is_adjustment flags
-- those rows so the transaction list can badge them. Run once in the Supabase
-- SQL editor on a database that already ran schema.sql and prior migrations.

alter table public.transactions
  add column if not exists is_adjustment boolean not null default false;
