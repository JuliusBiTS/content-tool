-- MediaLog initial schema
-- Single-user today, multi-user ready: every row carries user_id + RLS from day 1.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: insert own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- items ----------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('series', 'movie', 'anime', 'book')),
  title text not null,
  sort_title text not null default '',
  poster_url text,
  backdrop_url text,
  source text not null default 'manual'
    check (source in ('tmdb', 'anilist', 'openlibrary', 'manual')),
  source_id text,
  status text not null default 'planned'
    check (status in ('watching', 'done', 'planned', 'paused', 'dropped')),
  rating smallint check (rating between 1 and 5),
  current_position integer not null default 0,
  total_units integer,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists items_user_status_idx on public.items (user_id, status);
create index if not exists items_user_updated_idx on public.items (user_id, updated_at);

alter table public.items enable row level security;

create policy "items: owner full access" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- events (append-only progress log) ----------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  kind text not null check (kind in ('progress', 'status', 'rating', 'add')),
  from_position integer,
  to_position integer,
  note text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists events_user_occurred_idx on public.events (user_id, occurred_at);
create index if not exists events_user_created_idx on public.events (user_id, created_at);
create index if not exists events_item_idx on public.events (item_id);

alter table public.events enable row level security;

create policy "events: owner full access" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- updated_at maintenance ----------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at
  before update on public.items
  for each row execute function public.touch_updated_at();

-- ---------- grants (Supabase also applies default privileges, belt & braces) ----------
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.items to authenticated;
grant select, insert, update, delete on public.events to authenticated;
