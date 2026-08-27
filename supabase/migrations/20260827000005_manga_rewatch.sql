-- Manga as a tracked kind
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check
  check (kind in ('series', 'movie', 'anime', 'book', 'manga'));

-- New event kinds: rewatch (started a fresh run) and note (per-item / per-episode)
alter table public.events drop constraint if exists events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('progress', 'status', 'rating', 'add', 'rewatch', 'note'));

-- Per-episode diary (optional note + rating). Not tied to progress.
create table if not exists public.episode_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  season integer not null,
  episode integer not null,
  note text,
  rating smallint check (rating between 1 and 10),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (item_id, season, episode)
);

create index if not exists episode_notes_item_idx on public.episode_notes (item_id);
create index if not exists episode_notes_user_updated_idx
  on public.episode_notes (user_id, updated_at);

alter table public.episode_notes enable row level security;

create policy "episode_notes: owner full access" on public.episode_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.episode_notes to authenticated;

drop trigger if exists episode_notes_touch_updated_at on public.episode_notes;
create trigger episode_notes_touch_updated_at
  before update on public.episode_notes
  for each row execute function public.touch_updated_at();
