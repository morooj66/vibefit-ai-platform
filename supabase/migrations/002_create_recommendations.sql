-- VibeFit — Migration 002: recommendations table
-- نفّذ هذا الملف يدويًا من Supabase SQL Editor بعد schema.sql
-- لا يُنفَّذ تلقائيًا

-- ---------------------------------------------------------------------------
-- 1. recommendations
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 2. updated_at trigger
-- ---------------------------------------------------------------------------
drop trigger if exists recommendations_set_updated_at on public.recommendations;

create trigger recommendations_set_updated_at
  before update on public.recommendations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Row Level Security
-- MVP: INSERT من Frontend عبر anon client عندما user_id = auth.uid()
-- لاحقًا: التوليد ينتقل إلى Backend / Edge Function موثوقة
-- ---------------------------------------------------------------------------
alter table public.recommendations enable row level security;

drop policy if exists "recommendations_select_own" on public.recommendations;
create policy "recommendations_select_own"
  on public.recommendations
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "recommendations_insert_own" on public.recommendations;
create policy "recommendations_insert_own"
  on public.recommendations
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- لا UPDATE / DELETE من المستخدم في MVP (append-only عبر إنشاء جديد لاحقًا)
