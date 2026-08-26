-- Allow 'googlebooks' as a metadata source
alter table public.items drop constraint if exists items_source_check;
alter table public.items add constraint items_source_check
  check (source in ('tmdb', 'anilist', 'openlibrary', 'googlebooks', 'manual'));

-- Enable realtime delta pulls (cross-device live updates)
do $$
begin
  alter publication supabase_realtime add table public.items;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.events;
exception when duplicate_object then null;
end $$;
