-- MoveList / Our Home database schema
-- Run this entire file once in Supabase → SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  list_scope text not null check (list_scope in ('shared', 'personal')),
  owner_id uuid references auth.users(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  room text not null,
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  status text not null default 'to-buy' check (status in ('to-buy', 'researching', 'ordered', 'arrived')),
  quantity integer not null default 1 check (quantity > 0),
  estimated_price numeric(12,2) not null default 0 check (estimated_price >= 0),
  actual_price numeric(12,2) not null default 0 check (actual_price >= 0),
  url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_ownership_valid check (
    (list_scope = 'shared' and owner_id is null)
    or
    (list_scope = 'personal' and owner_id is not null)
  )
);

create index if not exists items_scope_idx on public.items(list_scope);
create index if not exists items_owner_idx on public.items(owner_id);
create index if not exists items_created_idx on public.items(created_at desc);

-- Create a profile automatically whenever an Auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, 'Home User'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill profiles if the first admin Auth user was created before this schema was run.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(u.email, 'Home User'), '@', 1))
from auth.users u
on conflict (id) do nothing;

-- Keep timestamps current.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_set_updated_at on public.items;
create trigger items_set_updated_at
before update on public.items
for each row execute procedure public.set_updated_at();

-- Prevent clients from changing an item's list/ownership identity after creation.
create or replace function public.protect_item_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.list_scope is distinct from old.list_scope
     or new.owner_id is distinct from old.owner_id
     or new.created_by is distinct from old.created_by then
    raise exception 'Item ownership and list scope cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists items_protect_identity on public.items;
create trigger items_protect_identity
before update on public.items
for each row execute procedure public.protect_item_identity();

-- RLS + least-privilege grants.
alter table public.profiles enable row level security;
alter table public.items enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.items from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select, insert, update, delete on table public.items to authenticated;

-- Profiles: signed-in house members may see display names; each person can edit only their own display name.
drop policy if exists "House members can read profiles" on public.profiles;
create policy "House members can read profiles"
on public.profiles for select
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "Users can update own display name" on public.profiles;
create policy "Users can update own display name"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Items: everyone can see the shared list; private items are only visible to their owner.
drop policy if exists "Users can read allowed items" on public.items;
create policy "Users can read allowed items"
on public.items for select
to authenticated
using (
  (select auth.uid()) is not null
  and (
    list_scope = 'shared'
    or (list_scope = 'personal' and owner_id = (select auth.uid()))
  )
);

-- New shared items can be created by any signed-in user. Personal items must belong to the caller.
drop policy if exists "Users can create allowed items" on public.items;
create policy "Users can create allowed items"
on public.items for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (list_scope = 'shared' and owner_id is null)
    or
    (list_scope = 'personal' and owner_id = (select auth.uid()))
  )
);

-- Everyone can edit shared items. Private items can only be edited by their owner.
drop policy if exists "Users can update allowed items" on public.items;
create policy "Users can update allowed items"
on public.items for update
to authenticated
using (
  list_scope = 'shared'
  or (list_scope = 'personal' and owner_id = (select auth.uid()))
)
with check (
  list_scope = 'shared'
  or (list_scope = 'personal' and owner_id = (select auth.uid()))
);

-- Same rule for deletion.
drop policy if exists "Users can delete allowed items" on public.items;
create policy "Users can delete allowed items"
on public.items for delete
to authenticated
using (
  list_scope = 'shared'
  or (list_scope = 'personal' and owner_id = (select auth.uid()))
);

-- Helper used only manually from the Supabase SQL editor to make the first account an admin.
create or replace function public.set_admin_by_email(target_email text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles p
  set role = 'admin'
  from auth.users u
  where p.id = u.id
    and lower(u.email) = lower(target_email);
end;
$$;

revoke all on function public.set_admin_by_email(text) from public, anon, authenticated;

-- After creating your first Auth user, run this separately and replace the email:
-- select public.set_admin_by_email('your-email@example.com');
