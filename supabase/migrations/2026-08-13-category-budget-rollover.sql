-- Lets a category's unused (or overspent) monthly budget carry into the
-- next month instead of resetting, opt-in per category.
alter table public.categories
  add column if not exists rollover boolean not null default false;
