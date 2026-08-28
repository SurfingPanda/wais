-- Households: let two or more people share one set of finances.
--
-- BACKEND GROUNDWORK ONLY. This migration adds the tables, a household_id on
-- every financial table (backfilled so each existing user becomes their own
-- one-person household), RLS that scopes rows by household membership, and
-- the RPCs an invite/join/leave UI will call. The app client still reads and
-- writes by user_id for now — the transitional RLS below keeps that working
-- (rows with household_id -> membership check; rows without -> user_id
-- check), and a BEFORE INSERT trigger stamps household_id on new rows so the
-- data converges. Safe to run once in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Household',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table if not exists public.household_invites (
  code text primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists household_members_user_idx on public.household_members (user_id);
create index if not exists household_members_household_idx on public.household_members (household_id);
create index if not exists household_invites_household_idx on public.household_invites (household_id);

create or replace trigger households_set_updated_at before update on public.households
  for each row execute function public.set_updated_at();
create or replace trigger household_members_set_updated_at before update on public.household_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Membership helpers (SECURITY DEFINER so policies on household_members
-- itself don't recurse)
-- ---------------------------------------------------------------------------

create or replace function public.is_household_member(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_household_owner(hid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

-- The creator of a household is automatically its owner.
create or replace function public.add_household_creator()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.household_members (household_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict (household_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists households_add_creator on public.households;
create trigger households_add_creator after insert on public.households
  for each row execute function public.add_household_creator();

-- Stamps household_id on a new financial row when the client didn't set one
-- (it doesn't yet). Picks the caller's first household; leaves it null if
-- they have none, and the transitional RLS below falls back to user_id.
create or replace function public.stamp_household_id()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.household_id is null then
    select m.household_id into new.household_id
    from public.household_members m
    where m.user_id = auth.uid()
    order by m.joined_at asc
    limit 1;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- household_id on every financial table + backfill
-- ---------------------------------------------------------------------------

alter table public.categories             add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.transactions           add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.budgets                add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.loans                  add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.accounts               add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.recurring_transactions add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.savings_goals          add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.grocery_items          add column if not exists household_id uuid references public.households(id) on delete cascade;
alter table public.grocery_purchases      add column if not exists household_id uuid references public.households(id) on delete cascade;

create index if not exists categories_household_updated_idx             on public.categories (household_id, updated_at);
create index if not exists transactions_household_updated_idx           on public.transactions (household_id, updated_at);
create index if not exists budgets_household_updated_idx                on public.budgets (household_id, updated_at);
create index if not exists loans_household_updated_idx                  on public.loans (household_id, updated_at);
create index if not exists accounts_household_updated_idx               on public.accounts (household_id, updated_at);
create index if not exists recurring_transactions_household_updated_idx on public.recurring_transactions (household_id, updated_at);
create index if not exists savings_goals_household_updated_idx          on public.savings_goals (household_id, updated_at);
create index if not exists grocery_items_household_updated_idx          on public.grocery_items (household_id, updated_at);
create index if not exists grocery_purchases_household_updated_idx      on public.grocery_purchases (household_id, updated_at);

-- One personal household per existing user who has any data; then point all
-- of that user's rows at it. Idempotent: re-running touches nothing (rows
-- already have household_id; the user already has a membership).
do $$
declare
  uid uuid;
  hid uuid;
begin
  for uid in (select id from auth.users) loop
    select m.household_id into hid
    from public.household_members m
    where m.user_id = uid
    limit 1;

    if hid is null and (
         exists (select 1 from public.categories where user_id = uid)
      or exists (select 1 from public.transactions where user_id = uid)
      or exists (select 1 from public.budgets where user_id = uid)
      or exists (select 1 from public.loans where user_id = uid)
      or exists (select 1 from public.accounts where user_id = uid)
      or exists (select 1 from public.recurring_transactions where user_id = uid)
      or exists (select 1 from public.savings_goals where user_id = uid)
      or exists (select 1 from public.grocery_items where user_id = uid)
    ) then
      insert into public.households (name, created_by) values ('My household', uid)
      returning id into hid; -- households_add_creator adds the membership
    end if;

    if hid is not null then
      update public.categories             set household_id = hid where user_id = uid and household_id is null;
      update public.transactions           set household_id = hid where user_id = uid and household_id is null;
      update public.budgets                set household_id = hid where user_id = uid and household_id is null;
      update public.loans                  set household_id = hid where user_id = uid and household_id is null;
      update public.accounts               set household_id = hid where user_id = uid and household_id is null;
      update public.recurring_transactions set household_id = hid where user_id = uid and household_id is null;
      update public.savings_goals          set household_id = hid where user_id = uid and household_id is null;
      update public.grocery_items          set household_id = hid where user_id = uid and household_id is null;
      update public.grocery_purchases      set household_id = hid where user_id = uid and household_id is null;
    end if;
  end loop;
end;
$$;

drop trigger if exists categories_stamp_household on public.categories;
drop trigger if exists transactions_stamp_household on public.transactions;
drop trigger if exists budgets_stamp_household on public.budgets;
drop trigger if exists loans_stamp_household on public.loans;
drop trigger if exists accounts_stamp_household on public.accounts;
drop trigger if exists recurring_transactions_stamp_household on public.recurring_transactions;
drop trigger if exists savings_goals_stamp_household on public.savings_goals;
drop trigger if exists grocery_items_stamp_household on public.grocery_items;
drop trigger if exists grocery_purchases_stamp_household on public.grocery_purchases;

create trigger categories_stamp_household             before insert on public.categories             for each row execute function public.stamp_household_id();
create trigger transactions_stamp_household           before insert on public.transactions           for each row execute function public.stamp_household_id();
create trigger budgets_stamp_household                before insert on public.budgets                for each row execute function public.stamp_household_id();
create trigger loans_stamp_household                  before insert on public.loans                  for each row execute function public.stamp_household_id();
create trigger accounts_stamp_household               before insert on public.accounts               for each row execute function public.stamp_household_id();
create trigger recurring_transactions_stamp_household before insert on public.recurring_transactions for each row execute function public.stamp_household_id();
create trigger savings_goals_stamp_household          before insert on public.savings_goals          for each row execute function public.stamp_household_id();
create trigger grocery_items_stamp_household          before insert on public.grocery_items          for each row execute function public.stamp_household_id();
create trigger grocery_purchases_stamp_household      before insert on public.grocery_purchases      for each row execute function public.stamp_household_id();

-- ---------------------------------------------------------------------------
-- RLS: new tables
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists "households_select" on public.households;
create policy "households_select" on public.households
  for select using (public.is_household_member(id));
drop policy if exists "households_insert" on public.households;
create policy "households_insert" on public.households
  for insert with check (created_by = auth.uid());
drop policy if exists "households_update" on public.households;
create policy "households_update" on public.households
  for update using (public.is_household_owner(id)) with check (public.is_household_member(id));
drop policy if exists "households_delete" on public.households;
create policy "households_delete" on public.households
  for delete using (public.is_household_owner(id));

-- Members can see everyone in their households. Inserts happen only through
-- the SECURITY DEFINER RPCs / trigger below (no insert policy). Anyone can
-- remove their own membership; owners can remove others.
drop policy if exists "household_members_select" on public.household_members;
create policy "household_members_select" on public.household_members
  for select using (public.is_household_member(household_id));
drop policy if exists "household_members_delete" on public.household_members;
create policy "household_members_delete" on public.household_members
  for delete using (user_id = auth.uid() or public.is_household_owner(household_id));

drop policy if exists "household_invites_select" on public.household_invites;
create policy "household_invites_select" on public.household_invites
  for select using (public.is_household_member(household_id));
drop policy if exists "household_invites_insert" on public.household_invites;
create policy "household_invites_insert" on public.household_invites
  for insert with check (public.is_household_member(household_id) and created_by = auth.uid());
drop policy if exists "household_invites_delete" on public.household_invites;
create policy "household_invites_delete" on public.household_invites
  for delete using (public.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- RLS: financial tables — household membership OR (legacy) own user_id
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'categories','transactions','budgets','loans','accounts',
    'recurring_transactions','savings_goals','grocery_items','grocery_purchases'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_access', t);
    execute format($f$
      create policy %I on public.%I
        for all
        using (
          (household_id is not null and public.is_household_member(household_id))
          or (household_id is null and auth.uid() = user_id)
        )
        with check (
          (household_id is not null and public.is_household_member(household_id))
          or (household_id is null and auth.uid() = user_id)
        )
    $f$, t || '_access', t);
  end loop;
end;
$$;

-- push_subscriptions stays strictly per-user (your devices, not the
-- household's) — its policy is unchanged.

-- ---------------------------------------------------------------------------
-- RPCs the invite / join / leave UI will call
-- ---------------------------------------------------------------------------

-- Creates a household and makes the caller its owner (via households_add_creator).
create or replace function public.create_household(household_name text default 'My household')
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  hid uuid;
begin
  insert into public.households (name, created_by)
  values (coalesce(nullif(btrim(household_name), ''), 'My household'), auth.uid())
  returning id into hid;
  return hid;
end;
$$;

create or replace function public.create_household_invite(hid uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c text;
begin
  if not public.is_household_member(hid) then
    raise exception 'Not a member of this household';
  end if;
  c := upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 8));
  insert into public.household_invites (code, household_id, created_by, expires_at)
  values (c, hid, auth.uid(), now() + interval '7 days');
  return c;
end;
$$;

create or replace function public.redeem_household_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inv public.household_invites%rowtype;
begin
  select * into inv from public.household_invites where code = invite_code;
  if inv.code is null then
    raise exception 'Invite not found';
  end if;
  if inv.expires_at < now() then
    raise exception 'Invite has expired';
  end if;
  insert into public.household_members (household_id, user_id, role)
  values (inv.household_id, auth.uid(), 'member')
  on conflict (household_id, user_id) do nothing;
  return inv.household_id;
end;
$$;

create or replace function public.leave_household(hid uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Don't let the last member walk out and orphan the household's data.
  if (select count(*) from public.household_members where household_id = hid) <= 1 then
    raise exception 'You are the only member — delete the household instead';
  end if;
  delete from public.household_members where household_id = hid and user_id = auth.uid();
end;
$$;

grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.redeem_household_invite(text) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;
