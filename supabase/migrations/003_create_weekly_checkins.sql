-- VibeFit — weekly_checkins (المتابعة الأسبوعية)
-- Supabase → SQL Editor → الصق الملف بالكامل → Run

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  planned_sessions int not null check (planned_sessions >= 1 and planned_sessions <= 7),
  completed_sessions int not null check (completed_sessions >= 0),
  adherence_rate numeric not null check (adherence_rate >= 0 and adherence_rate <= 1),
  energy_level int not null check (energy_level >= 1 and energy_level <= 5),
  difficulty_level int not null check (difficulty_level >= 1 and difficulty_level <= 5),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_checkins_completed_lte_planned
    check (completed_sessions <= planned_sessions),
  constraint weekly_checkins_user_week_unique unique (user_id, week_start)
);

create index if not exists weekly_checkins_user_id_idx
  on public.weekly_checkins (user_id);

create index if not exists weekly_checkins_week_start_idx
  on public.weekly_checkins (week_start);

create index if not exists weekly_checkins_created_at_idx
  on public.weekly_checkins (created_at desc);

drop trigger if exists weekly_checkins_set_updated_at on public.weekly_checkins;
create trigger weekly_checkins_set_updated_at
  before update on public.weekly_checkins
  for each row
  execute function public.set_updated_at();

alter table public.weekly_checkins enable row level security;

drop policy if exists "weekly_checkins_select_own" on public.weekly_checkins;
create policy "weekly_checkins_select_own"
  on public.weekly_checkins for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "weekly_checkins_insert_own" on public.weekly_checkins;
create policy "weekly_checkins_insert_own"
  on public.weekly_checkins for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "weekly_checkins_update_own" on public.weekly_checkins;
create policy "weekly_checkins_update_own"
  on public.weekly_checkins for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
