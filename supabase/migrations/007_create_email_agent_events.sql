-- VibeFit — Email Agent idempotency + rate limiting (n8n)
-- نفّذ يدويًا من Supabase SQL Editor بعد migration 006
-- آمن لإعادة التشغيل

-- ---------------------------------------------------------------------------
-- 1. external_thread_id on agent_conversations (Gmail thread continuity)
-- ---------------------------------------------------------------------------
alter table public.agent_conversations
  add column if not exists external_thread_id text;

create index if not exists agent_conversations_external_thread_idx
  on public.agent_conversations (channel, external_thread_id)
  where external_thread_id is not null;

-- ---------------------------------------------------------------------------
-- 2. email_agent_events — idempotency + audit (no raw email stored)
-- ---------------------------------------------------------------------------
create table if not exists public.email_agent_events (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  thread_id text,
  sender_hash text not null,
  status text not null check (status in ('processed', 'failed', 'ignored')),
  error_code text,
  created_at timestamptz not null default now(),
  constraint email_agent_events_message_id_unique unique (message_id)
);

create index if not exists email_agent_events_sender_hash_created_idx
  on public.email_agent_events (sender_hash, created_at desc);

create index if not exists email_agent_events_status_created_idx
  on public.email_agent_events (status, created_at desc);

alter table public.email_agent_events enable row level security;

-- service role only — no authenticated policies

-- ---------------------------------------------------------------------------
-- 3. RPC: check if Gmail message already processed
-- ---------------------------------------------------------------------------
create or replace function public.check_email_message_processed(p_message_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.email_agent_events e
    where e.message_id = trim(p_message_id)
  );
$$;

revoke all on function public.check_email_message_processed(text) from public;
grant execute on function public.check_email_message_processed(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC: rate limit per sender hash (default 10/hour)
-- ---------------------------------------------------------------------------
create or replace function public.check_email_sender_rate_limit(
  p_sender_hash text,
  p_max_per_hour integer default 10
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(*) < greatest(coalesce(p_max_per_hour, 10), 1)
  from public.email_agent_events e
  where e.sender_hash = trim(p_sender_hash)
    and e.created_at >= now() - interval '1 hour'
    and e.status in ('processed', 'failed');
$$;

revoke all on function public.check_email_sender_rate_limit(text, integer) from public;
grant execute on function public.check_email_sender_rate_limit(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC: register event (returns false if duplicate message_id)
-- ---------------------------------------------------------------------------
create or replace function public.register_email_agent_event(
  p_message_id text,
  p_thread_id text,
  p_sender_hash text,
  p_status text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if trim(coalesce(p_message_id, '')) = '' then
    return jsonb_build_object('registered', false, 'reason', 'EMPTY_MESSAGE_ID');
  end if;

  if p_status not in ('processed', 'failed', 'ignored') then
    return jsonb_build_object('registered', false, 'reason', 'INVALID_STATUS');
  end if;

  insert into public.email_agent_events (message_id, thread_id, sender_hash, status, error_code)
  values (trim(p_message_id), nullif(trim(p_thread_id), ''), trim(p_sender_hash), p_status, p_error_code)
  on conflict (message_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return jsonb_build_object('registered', false, 'reason', 'DUPLICATE');
  end if;

  return jsonb_build_object('registered', true, 'id', inserted_id);
end;
$$;

revoke all on function public.register_email_agent_event(text, text, text, text, text) from public;
grant execute on function public.register_email_agent_event(text, text, text, text, text) to service_role;
