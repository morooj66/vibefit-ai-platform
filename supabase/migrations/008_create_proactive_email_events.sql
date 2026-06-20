-- VibeFit — Proactive Lifecycle Email Events
-- نفّذ يدويًا من Supabase SQL Editor بعد migration 007
-- آمن لإعادة التشغيل: IF NOT EXISTS + CREATE OR REPLACE

do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'function public.set_updated_at() is missing — run migration 001 first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. email_preferences
-- ---------------------------------------------------------------------------
create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  welcome_emails boolean not null default true,
  progress_emails boolean not null default true,
  reminder_emails boolean not null default true,
  weekly_summary boolean not null default true,
  marketing_emails boolean not null default false,
  max_emails_per_week integer not null default 3 check (max_emails_per_week between 1 and 7),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists email_preferences_set_updated_at on public.email_preferences;
create trigger email_preferences_set_updated_at
  before update on public.email_preferences
  for each row
  execute function public.set_updated_at();

alter table public.email_preferences enable row level security;

drop policy if exists "email_preferences_select_own" on public.email_preferences;
create policy "email_preferences_select_own"
  on public.email_preferences for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "email_preferences_update_own" on public.email_preferences;
create policy "email_preferences_update_own"
  on public.email_preferences for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, update on table public.email_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- 2. proactive_email_events
-- ---------------------------------------------------------------------------
create table if not exists public.proactive_email_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'user_signed_up',
      'assessment_completed',
      'recommendation_completed',
      'weekly_checkin_missing',
      'adherence_dropped',
      'adherence_improved',
      'low_energy_detected',
      'high_difficulty_detected',
      'inactive_user_detected',
      'weekly_summary_due'
    )
  ),
  source_record_id uuid,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'sent', 'failed', 'skipped', 'retry_pending')
  ),
  scheduled_for timestamptz not null default now(),
  processed_at timestamptz,
  sent_at timestamptz,
  email_message_id text,
  deduplication_key text not null,
  retry_count integer not null default 0,
  error_code text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint proactive_email_events_dedup_unique unique (deduplication_key)
);

create index if not exists proactive_email_events_pending_idx
  on public.proactive_email_events (status, scheduled_for)
  where status in ('pending', 'retry_pending');

create index if not exists proactive_email_events_user_created_idx
  on public.proactive_email_events (user_id, created_at desc);

create index if not exists proactive_email_events_type_sent_idx
  on public.proactive_email_events (event_type, sent_at desc)
  where status = 'sent';

drop trigger if exists proactive_email_events_set_updated_at on public.proactive_email_events;
create trigger proactive_email_events_set_updated_at
  before update on public.proactive_email_events
  for each row
  execute function public.set_updated_at();

alter table public.proactive_email_events enable row level security;
-- service role only — no authenticated policies

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
create or replace function public.proactive_event_category(p_event_type text)
returns text
language sql
immutable
as $$
  select case
    when p_event_type in (
      'user_signed_up',
      'assessment_completed',
      'recommendation_completed'
    ) then 'operational'
    else 'motivational'
  end;
$$;

create or replace function public.ensure_email_preferences(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.email_preferences (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_email_preferences(uuid) from public;
grant execute on function public.ensure_email_preferences(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Enqueue event (idempotent via deduplication_key)
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_proactive_email_event(
  p_user_id uuid,
  p_event_type text,
  p_source_record_id uuid default null,
  p_deduplication_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_scheduled_for timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dedup text;
  v_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('enqueued', false, 'reason', 'MISSING_USER');
  end if;

  v_dedup := coalesce(
    nullif(trim(p_deduplication_key), ''),
    p_event_type || ':' || p_user_id::text
  );

  perform public.ensure_email_preferences(p_user_id);

  insert into public.proactive_email_events (
    user_id,
    event_type,
    source_record_id,
    deduplication_key,
    metadata,
    scheduled_for,
    status
  )
  values (
    p_user_id,
    p_event_type,
    p_source_record_id,
    v_dedup,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_scheduled_for, now()),
    'pending'
  )
  on conflict (deduplication_key) do nothing
  returning id into v_id;

  if v_id is null then
    return jsonb_build_object('enqueued', false, 'reason', 'DUPLICATE', 'deduplication_key', v_dedup);
  end if;

  return jsonb_build_object('enqueued', true, 'id', v_id, 'deduplication_key', v_dedup);
end;
$$;

revoke all on function public.enqueue_proactive_email_event(uuid, text, uuid, text, jsonb, timestamptz) from public;
grant execute on function public.enqueue_proactive_email_event(uuid, text, uuid, text, jsonb, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Fetch pending events for n8n
-- ---------------------------------------------------------------------------
create or replace function public.fetch_pending_proactive_events(p_limit integer default 20)
returns setof public.proactive_email_events
language sql
security definer
set search_path = public
as $$
  select e.*
  from public.proactive_email_events e
  join public.email_preferences pref on pref.user_id = e.user_id
  where e.status in ('pending', 'retry_pending')
    and e.scheduled_for <= now()
    and pref.unsubscribed_at is null
  order by
    case e.event_type
      when 'recommendation_completed' then 1
      when 'low_energy_detected' then 2
      when 'high_difficulty_detected' then 2
      when 'weekly_summary_due' then 3
      when 'weekly_checkin_missing' then 4
      when 'adherence_dropped' then 5
      when 'adherence_improved' then 6
      when 'inactive_user_detected' then 7
      when 'assessment_completed' then 8
      when 'user_signed_up' then 9
      else 10
    end,
    e.scheduled_for asc
  limit greatest(coalesce(p_limit, 20), 1);
$$;

revoke all on function public.fetch_pending_proactive_events(integer) from public;
grant execute on function public.fetch_pending_proactive_events(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Update event status
-- ---------------------------------------------------------------------------
create or replace function public.update_proactive_event_status(
  p_event_id uuid,
  p_status text,
  p_error_code text default null,
  p_email_message_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('pending', 'processing', 'sent', 'failed', 'skipped', 'retry_pending') then
    return jsonb_build_object('updated', false, 'reason', 'INVALID_STATUS');
  end if;

  update public.proactive_email_events
  set
    status = p_status,
    error_code = p_error_code,
    email_message_id = nullif(trim(p_email_message_id), ''),
    processed_at = case when p_status in ('sent', 'failed', 'skipped') then now() else processed_at end,
    sent_at = case when p_status = 'sent' then now() else sent_at end,
    retry_count = case when p_status = 'retry_pending' then retry_count + 1 else retry_count end,
    updated_at = now()
  where id = p_event_id;

  if not found then
    return jsonb_build_object('updated', false, 'reason', 'NOT_FOUND');
  end if;

  return jsonb_build_object('updated', true);
end;
$$;

revoke all on function public.update_proactive_event_status(uuid, text, text, text) from public;
grant execute on function public.update_proactive_event_status(uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. User email lookup (service role — no raw email in logs from app)
-- ---------------------------------------------------------------------------
create or replace function public.get_user_email_for_proactive(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.email
  from auth.users u
  where u.id = p_user_id
  limit 1;
$$;

revoke all on function public.get_user_email_for_proactive(uuid) from public;
grant execute on function public.get_user_email_for_proactive(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Rate / guard helpers for Agent
-- ---------------------------------------------------------------------------
create or replace function public.count_proactive_emails_sent(
  p_user_id uuid,
  p_days integer default 7
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.proactive_email_events e
  where e.user_id = p_user_id
    and e.status = 'sent'
    and e.sent_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1));
$$;

revoke all on function public.count_proactive_emails_sent(uuid, integer) from public;
grant execute on function public.count_proactive_emails_sent(uuid, integer) to service_role;

create or replace function public.was_proactive_event_sent_recently(
  p_user_id uuid,
  p_event_type text,
  p_days integer default 7
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proactive_email_events e
    where e.user_id = p_user_id
      and e.event_type = p_event_type
      and e.status = 'sent'
      and e.sent_at >= now() - make_interval(days => greatest(coalesce(p_days, 7), 1))
  );
$$;

revoke all on function public.was_proactive_event_sent_recently(uuid, text, integer) from public;
grant execute on function public.was_proactive_event_sent_recently(uuid, text, integer) to service_role;

create or replace function public.had_motivational_email_today(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.proactive_email_events e
    where e.user_id = p_user_id
      and e.status = 'sent'
      and e.sent_at >= date_trunc('day', now())
      and public.proactive_event_category(e.event_type) = 'motivational'
  );
$$;

revoke all on function public.had_motivational_email_today(uuid) from public;
grant execute on function public.had_motivational_email_today(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 9. Database triggers — operational lifecycle events
-- ---------------------------------------------------------------------------
create or replace function public.trigger_proactive_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text;
  v_confirmed timestamptz;
begin
  select u.email, u.email_confirmed_at
  into v_email, v_confirmed
  from auth.users u
  where u.id = new.user_id;

  if v_email is null or trim(v_email) = '' then
    return new;
  end if;

  -- إذا كان تأكيد البريد مطلوبًا ولم يُؤكَّد بعد، لا نُرسل الآن
  if v_confirmed is null then
    return new;
  end if;

  perform public.enqueue_proactive_email_event(
    new.user_id,
    'user_signed_up',
    new.id,
    'welcome:' || new.user_id::text,
    jsonb_build_object('display_name', new.display_name),
    now() + interval '2 minutes'
  );

  return new;
end;
$$;

drop trigger if exists profiles_proactive_welcome on public.profiles;
create trigger profiles_proactive_welcome
  after insert on public.profiles
  for each row
  execute function public.trigger_proactive_welcome_email();

create or replace function public.trigger_proactive_assessment_completed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.enqueue_proactive_email_event(
    new.user_id,
    'assessment_completed',
    new.id,
    'assessment:' || new.id::text,
    jsonb_build_object(
      'primary_goal', new.primary_goal,
      'experience_level', new.experience_level,
      'training_days_per_week', new.training_days_per_week
    ),
    now() + interval '1 minute'
  );
  return new;
end;
$$;

drop trigger if exists assessments_proactive_completed on public.assessments;
create trigger assessments_proactive_completed
  after insert on public.assessments
  for each row
  execute function public.trigger_proactive_assessment_completed();

create or replace function public.trigger_proactive_recommendation_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'completed' then
    perform public.enqueue_proactive_email_event(
      new.user_id,
      'recommendation_completed',
      new.id,
      'recommendation:' || new.id::text,
      jsonb_build_object('assessment_id', new.assessment_id),
      now() + interval '1 minute'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists recommendations_proactive_ready on public.recommendations;
create trigger recommendations_proactive_ready
  after insert on public.recommendations
  for each row
  execute function public.trigger_proactive_recommendation_ready();

create or replace function public.trigger_email_preferences_on_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_email_preferences(new.user_id);
  return new;
end;
$$;

drop trigger if exists profiles_ensure_email_preferences on public.profiles;
create trigger profiles_ensure_email_preferences
  after insert on public.profiles
  for each row
  execute function public.trigger_email_preferences_on_profile();

-- ---------------------------------------------------------------------------
-- 10. Scheduled detection (n8n calls hourly/daily)
-- ---------------------------------------------------------------------------
create or replace function public.run_proactive_lifecycle_detection()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enqueued integer := 0;
  v_result jsonb;
  r record;
  v_iso_week text;
  v_iso_month text;
  v_dedup text;
  v_avg_adherence numeric;
  v_prev_adherence numeric;
  v_latest_energy numeric;
  v_prev_energy numeric;
begin
  v_iso_week := to_char(now(), 'IYYY-"W"IW');
  v_iso_month := to_char(now(), 'YYYY-MM');

  -- A) weekly_checkin_missing — no check-in in 7 days, reminder not sent in 5 days
  for r in
    select distinct rec.user_id
    from public.recommendations rec
    join public.email_preferences pref on pref.user_id = rec.user_id
    where rec.status = 'completed'
      and pref.unsubscribed_at is null
      and pref.reminder_emails = true
      and not exists (
        select 1 from public.weekly_checkins wc
        where wc.user_id = rec.user_id
          and wc.created_at >= now() - interval '7 days'
      )
      and not exists (
        select 1 from public.proactive_email_events e
        where e.user_id = rec.user_id
          and e.event_type = 'weekly_checkin_missing'
          and e.status = 'sent'
          and e.sent_at >= now() - interval '5 days'
      )
  loop
    v_dedup := 'checkin-missing:' || r.user_id::text || ':' || v_iso_week;
    v_result := public.enqueue_proactive_email_event(
      r.user_id, 'weekly_checkin_missing', null, v_dedup, '{}'::jsonb, now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  -- B) adherence_dropped — last 2 checkins avg < 60% or drop >= 15 points
  for r in
    with ranked as (
      select
        wc.user_id,
        wc.adherence_rate,
        wc.week_start,
        row_number() over (partition by wc.user_id order by wc.week_start desc) as rn
      from public.weekly_checkins wc
    ),
    pairs as (
      select
        user_id,
        max(case when rn = 1 then round((case when adherence_rate > 1 then adherence_rate / 100 else adherence_rate end) * 100) end) as latest_pct,
        max(case when rn = 2 then round((case when adherence_rate > 1 then adherence_rate / 100 else adherence_rate end) * 100) end) as prev_pct,
        avg(case when rn <= 2 then (case when adherence_rate > 1 then adherence_rate / 100 else adherence_rate end) * 100 end) as avg_last_two
      from ranked
      where rn <= 2
      group by user_id
      having count(*) >= 2
    )
    select p.user_id, p.latest_pct, p.prev_pct, p.avg_last_two
    from pairs p
    join public.email_preferences pref on pref.user_id = p.user_id
    where pref.unsubscribed_at is null
      and pref.progress_emails = true
      and (p.avg_last_two < 60 or (p.prev_pct - p.latest_pct) >= 15)
      and not public.was_proactive_event_sent_recently(p.user_id, 'adherence_dropped', 7)
      and not public.had_motivational_email_today(p.user_id)
  loop
    v_dedup := 'adherence-drop:' || r.user_id::text || ':' || v_iso_week;
    v_result := public.enqueue_proactive_email_event(
      r.user_id,
      'adherence_dropped',
      null,
      v_dedup,
      jsonb_build_object('latest_adherence', r.latest_pct, 'prev_adherence', r.prev_pct),
      now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  -- C) adherence_improved — +15% or completed all planned
  for r in
    with ranked as (
      select
        wc.user_id,
        wc.adherence_rate,
        wc.planned_sessions,
        wc.completed_sessions,
        wc.week_start,
        row_number() over (partition by wc.user_id order by wc.week_start desc) as rn
      from public.weekly_checkins wc
    ),
    pairs as (
      select
        user_id,
        max(case when rn = 1 then round((case when adherence_rate > 1 then adherence_rate / 100 else adherence_rate end) * 100) end) as latest_pct,
        max(case when rn = 2 then round((case when adherence_rate > 1 then adherence_rate / 100 else adherence_rate end) * 100) end) as prev_pct,
        bool_or(rn = 1 and completed_sessions >= planned_sessions and planned_sessions > 0) as completed_all
      from ranked
      where rn <= 2
      group by user_id
      having count(*) >= 2
    )
    select p.user_id
    from pairs p
    join public.email_preferences pref on pref.user_id = p.user_id
    where pref.unsubscribed_at is null
      and pref.progress_emails = true
      and (p.completed_all or (p.latest_pct - p.prev_pct) >= 15)
      and not public.was_proactive_event_sent_recently(p.user_id, 'adherence_improved', 7)
      and not public.had_motivational_email_today(p.user_id)
  loop
    v_dedup := 'adherence-improved:' || r.user_id::text || ':' || v_iso_week;
    v_result := public.enqueue_proactive_email_event(
      r.user_id, 'adherence_improved', null, v_dedup, '{}'::jsonb, now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  -- D) low_energy_detected — last 2 energy <= 2
  for r in
    with ranked as (
      select wc.user_id, wc.energy_level,
        row_number() over (partition by wc.user_id order by wc.week_start desc) as rn
      from public.weekly_checkins wc
    )
    select user_id
    from ranked
    where rn <= 2
    group by user_id
    having count(*) = 2 and max(energy_level) <= 2
  loop
    if not exists (
      select 1 from public.email_preferences pref
      where pref.user_id = r.user_id and pref.unsubscribed_at is null and pref.progress_emails = true
    ) then continue; end if;
    if public.was_proactive_event_sent_recently(r.user_id, 'low_energy_detected', 7) then continue; end if;
    if public.had_motivational_email_today(r.user_id) then continue; end if;

    v_dedup := 'low-energy:' || r.user_id::text || ':' || v_iso_week;
    v_result := public.enqueue_proactive_email_event(
      r.user_id, 'low_energy_detected', null, v_dedup, '{}'::jsonb, now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  -- E) high_difficulty_detected — last 2 difficulty >= 4
  for r in
    with ranked as (
      select wc.user_id, wc.difficulty_level,
        row_number() over (partition by wc.user_id order by wc.week_start desc) as rn
      from public.weekly_checkins wc
    )
    select user_id
    from ranked
    where rn <= 2
    group by user_id
    having count(*) = 2 and min(difficulty_level) >= 4
  loop
    if not exists (
      select 1 from public.email_preferences pref
      where pref.user_id = r.user_id and pref.unsubscribed_at is null and pref.progress_emails = true
    ) then continue; end if;
    if public.was_proactive_event_sent_recently(r.user_id, 'high_difficulty_detected', 7) then continue; end if;
    if public.had_motivational_email_today(r.user_id) then continue; end if;

    v_dedup := 'high-difficulty:' || r.user_id::text || ':' || v_iso_week;
    v_result := public.enqueue_proactive_email_event(
      r.user_id, 'high_difficulty_detected', null, v_dedup, '{}'::jsonb, now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  -- F) inactive_user_detected — no check-in in 14 days, has assessment, no inactive in 14 days
  for r in
    select a.user_id
    from public.assessments a
    join public.email_preferences pref on pref.user_id = a.user_id
    where pref.unsubscribed_at is null
      and pref.progress_emails = true
      and not exists (
        select 1 from public.weekly_checkins wc
        where wc.user_id = a.user_id
          and wc.created_at >= now() - interval '14 days'
      )
      and not public.was_proactive_event_sent_recently(a.user_id, 'inactive_user_detected', 14)
      and not public.had_motivational_email_today(a.user_id)
    group by a.user_id
  loop
    v_dedup := 'inactive:' || r.user_id::text || ':' || v_iso_month;
    v_result := public.enqueue_proactive_email_event(
      r.user_id, 'inactive_user_detected', null, v_dedup, '{}'::jsonb, now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  -- G) weekly_summary_due — active users once per ISO week
  for r in
    select distinct wc.user_id
    from public.weekly_checkins wc
    join public.email_preferences pref on pref.user_id = wc.user_id
    where pref.unsubscribed_at is null
      and pref.weekly_summary = true
      and wc.created_at >= now() - interval '14 days'
      and not exists (
        select 1 from public.proactive_email_events e
        where e.user_id = wc.user_id
          and e.event_type = 'weekly_summary_due'
          and e.deduplication_key = 'weekly-summary:' || wc.user_id::text || ':' || v_iso_week
      )
  loop
    v_dedup := 'weekly-summary:' || r.user_id::text || ':' || v_iso_week;
    v_result := public.enqueue_proactive_email_event(
      r.user_id, 'weekly_summary_due', null, v_dedup, jsonb_build_object('iso_week', v_iso_week), now()
    );
    if (v_result->>'enqueued')::boolean then v_enqueued := v_enqueued + 1; end if;
  end loop;

  return jsonb_build_object('enqueued', v_enqueued, 'detected_at', now());
end;
$$;

revoke all on function public.run_proactive_lifecycle_detection() from public;
grant execute on function public.run_proactive_lifecycle_detection() to service_role;
