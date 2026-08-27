-- ---------- Web Push subscriptions ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text,
  created_at timestamptz not null default now(),
  last_notified_at timestamptz
);

alter table public.push_subscriptions enable row level security;

create policy "push: owner full access" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------- Daily "new episode" check ----------
-- Requires the pg_cron and pg_net extensions (enable once in the dashboard:
--   Database → Extensions → pg_cron, pg_net).
--
-- The Authorization header (anon key) satisfies the function's JWT check, so
-- you do NOT need to disable "Verify JWT" on the function. The real gate is the
-- x-cron-secret header, which the function compares against its CRON_SECRET.
--
-- Replace all three placeholders below, then run this block.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  perform cron.unschedule('medialog-notify-airing');
exception when others then null;
end $$;

select cron.schedule(
  'medialog-notify-airing',
  '0 8 * * *', -- every day 08:00 UTC
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-airing',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <ANON_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
