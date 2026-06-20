-- VibeFit — Bootstrap كامل (نفّذ يدويًا مرة واحدة)
-- Supabase → SQL Editor → الصق الملف بالكامل → Run
-- الترتيب: هذا الملف يشمل schema.sql + recommendations + backfill للمستخدمين الحاليين

-- ===========================================================================
-- 1. profiles
-- ===========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===========================================================================
-- 2. assessments
-- ===========================================================================
create table if not exists public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  age int not null check (age >= 16 and age <= 80),
  gender text check (gender in ('male', 'female', 'prefer_not_to_say')),
  height_cm numeric not null check (height_cm >= 100 and height_cm <= 250),
  weight_kg numeric not null check (weight_kg >= 30 and weight_kg <= 300),
  activity_level text not null check (activity_level in ('low', 'medium', 'active')),
  primary_goal text not null check (
    primary_goal in ('weight_loss', 'muscle_gain', 'general_fitness')
  ),
  experience_level text not null check (
    experience_level in ('beginner', 'intermediate', 'advanced')
  ),
  training_days_per_week int not null check (
    training_days_per_week >= 1 and training_days_per_week <= 7
  ),
  session_duration_minutes int not null check (
    session_duration_minutes in (20, 30, 45, 60)
  ),
  training_location text not null check (training_location in ('home', 'gym')),
  equipment text not null,
  constraints_notes text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists assessments_user_id_created_at_idx
  on public.assessments (user_id, created_at desc);

-- ===========================================================================
-- 3. recommendations
-- ===========================================================================
create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  assessment_id uuid not null unique references public.assessments (id) on delete cascade,
  summary text not null,
  weekly_plan jsonb not null,
  nutrition_notes jsonb not null,
  safety_notes jsonb not null,
  generation_type text not null default 'mock' check (generation_type in ('mock')),
  model_name text,
  status text not null default 'completed' check (status in ('completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recommendations_user_id_idx
  on public.recommendations (user_id);

create index if not exists recommendations_assessment_id_idx
  on public.recommendations (assessment_id);

create index if not exists recommendations_created_at_idx
  on public.recommendations (created_at desc);

-- ===========================================================================
-- 4. triggers & functions
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, user_id, display_name, created_at, updated_at)
  values (
    new.id,
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    now(),
    now()
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists recommendations_set_updated_at on public.recommendations;
create trigger recommendations_set_updated_at
  before update on public.recommendations
  for each row
  execute function public.set_updated_at();

-- ===========================================================================
-- 5. backfill profiles للمستخدمين المسجّلين قبل تشغيل SQL
-- ===========================================================================
insert into public.profiles (id, user_id, display_name, created_at, updated_at)
select
  u.id,
  u.id,
  nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
  now(),
  now()
from auth.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null;

-- ===========================================================================
-- 6. Row Level Security
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.assessments enable row level security;
alter table public.recommendations enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "assessments_select_own" on public.assessments;
create policy "assessments_select_own"
  on public.assessments for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "assessments_insert_own" on public.assessments;
create policy "assessments_insert_own"
  on public.assessments for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "recommendations_select_own" on public.recommendations;
create policy "recommendations_select_own"
  on public.recommendations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recommendations_insert_own" on public.recommendations;
create policy "recommendations_insert_own"
  on public.recommendations for insert to authenticated
  with check (auth.uid() = user_id);
