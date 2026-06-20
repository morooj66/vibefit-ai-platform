-- VibeFit — دعم توصيات AI وحالات pending/failed
-- نفّذ يدويًا من Supabase SQL Editor

alter table public.recommendations
  drop constraint if exists recommendations_generation_type_check;

alter table public.recommendations
  add constraint recommendations_generation_type_check
  check (generation_type in ('mock', 'ai'));

alter table public.recommendations
  drop constraint if exists recommendations_status_check;

alter table public.recommendations
  add constraint recommendations_status_check
  check (status in ('pending', 'completed', 'failed', 'archived'));
