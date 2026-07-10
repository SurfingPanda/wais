-- Adds due-date tracking to loans on an existing database that already ran
-- schema.sql and the loans migration. Safe to run once in the Supabase SQL editor.

alter table public.loans
  add column if not exists due_day smallint check (due_day between 1 and 31),
  add column if not exists due_date date;
