-- Ratings move to half-star granularity: stored as integer half-star units
-- 1..10 (= 0.5..5.0 stars). Existing 1..5 values are doubled once.
alter table public.items drop constraint if exists items_rating_check;

update public.items
set rating = rating * 2
where rating is not null
  and rating <= 5
  and not exists (select 1 from public.items where rating > 5);

alter table public.items
  add constraint items_rating_check check (rating between 1 and 10);
