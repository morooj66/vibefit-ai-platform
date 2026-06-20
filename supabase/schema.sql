-- VibeFit MVP — profiles + assessments
-- نفّذ هذا الملف يدويًا من Supabase SQL Editor (لا يُنفَّذ تلقائيًا)

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  user_id uuid not null unique references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. assessments
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. auto-create profile on signup
-- ---------------------------------------------------------------------------
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
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. updated_at helper
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- كل مستخدم يرى ويكتب بياناته فقط عبر auth.uid()
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.assessments enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- assessments
drop policy if exists "assessments_select_own" on public.assessments;
create policy "assessments_select_own"
  on public.assessments
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "assessments_insert_own" on public.assessments;
create policy "assessments_insert_own"
  on public.assessments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RLS ملخص:
-- SELECT / INSERT / UPDATE على profiles للمستخدم الحالي فقط
-- SELECT / INSERT على assessments للمستخدم الحالي فقط (append-only)
-- ---------------------------------------------------------------------------
