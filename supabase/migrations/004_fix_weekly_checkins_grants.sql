-- VibeFit — Fix weekly_checkins permissions (authenticated INSERT/UPDATE/SELECT)
-- نفّذ يدويًا من Supabase SQL Editor إذا فشل حفظ المتابعة

-- تأكيد قيد التفرد (مطلوب لمنع تكرار نفس الأسبوع)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_checkins_user_week_unique'
  ) then
    alter table public.weekly_checkins
      add constraint weekly_checkins_user_week_unique unique (user_id, week_start);
  end if;
end $$;

grant select, insert, update on table public.weekly_checkins to authenticated;

-- إعادة تأكيد سياسات RLS (آمن للتكرار)
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
