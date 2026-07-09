-- Run this entire file in Supabase Dashboard → SQL Editor.
--
-- NOTE: the tasks table below was the only piece originally captured in this
-- file, even though the app has always depended on a routines table, a
-- profiles table with a pin_hash column, and the set_my_pin/verify_my_pin
-- RPCs. Those pieces already exist in the live project (created directly via
-- the SQL editor at some point) but were never added here. The definitions
-- below are reconstructed from how app.js/calendar.js/auth.js actually call
-- them, so diff this against the real schema in the Supabase dashboard
-- before re-running it — every statement uses "if not exists"/"or replace"
-- so it's safe to run against a database that already has these objects,
-- but the profile-creation trigger in particular may duplicate a mechanism
-- you already have under a different name.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- tasks ----------------------------------------------------------------

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  category text not null default 'today'
    check (category in ('today', 'followup', 'schedule', 'later')),
  due_date date,
  completed boolean not null default false,
  completed_at timestamptz,
  priority text not null default 'normal'
    check (priority in ('must', 'normal', 'later')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_id_idx on public.tasks(user_id);
create index if not exists tasks_user_due_idx on public.tasks(user_id, due_date);
create index if not exists tasks_user_category_idx on public.tasks(user_id, category);

alter table public.tasks enable row level security;

drop policy if exists "Users can view their own tasks" on public.tasks;
create policy "Users can view their own tasks"
on public.tasks for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own tasks" on public.tasks;
create policy "Users can create their own tasks"
on public.tasks for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own tasks" on public.tasks;
create policy "Users can update their own tasks"
on public.tasks for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own tasks" on public.tasks;
create policy "Users can delete their own tasks"
on public.tasks for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

-- routines ---------------------------------------------------------------

create table if not exists public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 500),
  time_of_day time not null default '09:00',
  frequency text not null default 'daily'
    check (frequency in ('daily', 'weekly', 'monthly')),
  weekday smallint check (weekday between 0 and 6),
  monthday smallint check (monthday between 1 and 31),
  completion_date date,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists routines_user_id_idx on public.routines(user_id);

alter table public.routines enable row level security;

drop policy if exists "Users can view their own routines" on public.routines;
create policy "Users can view their own routines"
on public.routines for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own routines" on public.routines;
create policy "Users can create their own routines"
on public.routines for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own routines" on public.routines;
create policy "Users can update their own routines"
on public.routines for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own routines" on public.routines;
create policy "Users can delete their own routines"
on public.routines for delete
to authenticated
using ((select auth.uid()) = user_id);

drop trigger if exists set_routines_updated_at on public.routines;
create trigger set_routines_updated_at
before update on public.routines
for each row execute function public.set_updated_at();

-- profiles + PIN -----------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Creates a profile row automatically when someone signs up, pulling the
-- display name captured at signup time (see auth.js: signUp options.data.name).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', 'there'))
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_my_pin(new_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_pin !~ '^[0-9]{4}$' then
    raise exception 'PIN must be exactly 4 digits.';
  end if;

  update public.profiles
  set pin_hash = extensions.crypt(new_pin, extensions.gen_salt('bf'))
  where id = auth.uid();
end;
$$;

create or replace function public.verify_my_pin(entered_pin text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_hash text;
begin
  select pin_hash into stored_hash
  from public.profiles
  where id = auth.uid();

  if stored_hash is null then
    return false;
  end if;

  return stored_hash = extensions.crypt(entered_pin, stored_hash);
end;
$$;
