-- VibeFit — Knowledge Base (RAG) + AI Agent tables
-- نفّذ يدويًا من Supabase SQL Editor بعد migrations 001–005
-- آمن لإعادة التشغيل: IF NOT EXISTS + DROP POLICY IF EXISTS + CREATE OR REPLACE
-- RAG: Full-text search (PostgreSQL tsvector) — ليس Vector Database

-- تأكد من دالة updated_at (موجودة في migration 001)
do $$
begin
  if not exists (
    select 1 from pg_proc where proname = 'set_updated_at' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'function public.set_updated_at() is missing — run migration 001 first';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. knowledge_documents (Full-text RAG — بدون pgvector)
-- ---------------------------------------------------------------------------
create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  content text not null,
  source_name text not null default 'VibeFit Knowledge Base',
  source_url text,
  chunk_index integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  search_vector tsvector generated always as (
    to_tsvector(
      'simple',
      coalesce(title, '') || ' ' || coalesce(category, '') || ' ' || coalesce(content, '')
    )
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'knowledge_documents_title_category_unique'
  ) then
    alter table public.knowledge_documents
      add constraint knowledge_documents_title_category_unique unique (title, category);
  end if;
end $$;

create index if not exists knowledge_documents_category_idx
  on public.knowledge_documents (category)
  where is_active = true;

create index if not exists knowledge_documents_search_idx
  on public.knowledge_documents using gin (search_vector);

create index if not exists knowledge_documents_active_idx
  on public.knowledge_documents (is_active, chunk_index);

drop trigger if exists knowledge_documents_set_updated_at on public.knowledge_documents;
create trigger knowledge_documents_set_updated_at
  before update on public.knowledge_documents
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Full-text search (PostgreSQL — ليس Vector Search)
-- Returns: id, title, category, content, source_name, source_url, relevance_score (score)
-- ---------------------------------------------------------------------------
create or replace function public.search_knowledge_documents(
  search_query text,
  category_filter text default null,
  result_limit integer default 5,
  min_score numeric default 0.05
)
returns table (
  id uuid,
  title text,
  category text,
  content text,
  source_name text,
  source_url text,
  relevance_score numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  normalized_query text;
  ts_query tsquery;
  or_query tsquery;
begin
  normalized_query := trim(coalesce(search_query, ''));
  normalized_query := regexp_replace(normalized_query, '[؟?!.,،:;()\[\]{}«»"'']', ' ', 'g');
  normalized_query := regexp_replace(normalized_query, '\s+', ' ', 'g');

  if length(normalized_query) = 0 then
    return;
  end if;

  ts_query := plainto_tsquery('simple', normalized_query);

  if ts_query is null or ts_query = ''::tsquery then
    ts_query := to_tsquery(
      'simple',
      regexp_replace(normalized_query, '\s+', ' | ', 'g')
    );
  end if;

  or_query := to_tsquery(
    'simple',
    coalesce(
      (
        select string_agg(word, ' | ')
        from regexp_split_to_table(normalized_query, '\s+') as token(word)
        where length(word) >= 2
      ),
      normalized_query
    )
  );

  return query
  with ranked as (
    select
      kd.id,
      kd.title,
      kd.category,
      kd.content,
      kd.source_name,
      kd.source_url,
      (
        coalesce(ts_rank(kd.search_vector, ts_query), 0) * 2
        + coalesce(ts_rank(kd.search_vector, or_query), 0)
        + case when kd.title ilike '%' || normalized_query || '%' then 0.5 else 0 end
        + case when kd.category ilike '%' || normalized_query || '%' then 0.35 else 0 end
        + (
          select count(*)::numeric * 0.06
          from regexp_split_to_table(normalized_query, '\s+') as token(word)
          where length(word) >= 2
            and (
              kd.content ilike '%' || word || '%'
              or kd.title ilike '%' || word || '%'
              or kd.category ilike '%' || word || '%'
            )
        )
      )::numeric as score
    from public.knowledge_documents kd
    where kd.is_active = true
      and (
        category_filter is null
        or kd.category = category_filter
      )
      and (
        kd.search_vector @@ ts_query
        or (or_query is not null and kd.search_vector @@ or_query)
        or kd.title ilike '%' || normalized_query || '%'
        or kd.content ilike '%' || normalized_query || '%'
        or kd.category ilike '%' || normalized_query || '%'
        or exists (
          select 1
          from regexp_split_to_table(normalized_query, '\s+') as token(word)
          where length(word) >= 2
            and (
              kd.content ilike '%' || word || '%'
              or kd.title ilike '%' || word || '%'
              or kd.category ilike '%' || word || '%'
            )
        )
      )
  )
  select
    ranked.id,
    ranked.title,
    ranked.category,
    ranked.content,
    ranked.source_name,
    ranked.source_url,
    ranked.score as relevance_score
  from ranked
  where ranked.score >= min_score
  order by ranked.score desc, ranked.title asc
  limit greatest(1, least(coalesce(result_limit, 5), 5));
end;
$$;

revoke all on function public.search_knowledge_documents(text, text, integer, numeric) from public;
grant execute on function public.search_knowledge_documents(text, text, integer, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- 3. agent_conversations
-- ---------------------------------------------------------------------------
create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  channel text not null check (channel in ('web', 'email', 'whatsapp')),
  external_sender_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_conversations_user_id_idx
  on public.agent_conversations (user_id, updated_at desc);

drop trigger if exists agent_conversations_set_updated_at on public.agent_conversations;
create trigger agent_conversations_set_updated_at
  before update on public.agent_conversations
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. agent_messages
-- ---------------------------------------------------------------------------
create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  intent text,
  used_rag boolean not null default false,
  used_personal_data boolean not null default false,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_messages_conversation_id_idx
  on public.agent_messages (conversation_id, created_at asc);

-- ---------------------------------------------------------------------------
-- 5. agent_runs
-- ---------------------------------------------------------------------------
create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.agent_conversations (id) on delete set null,
  user_id uuid references auth.users (id) on delete set null,
  channel text not null check (channel in ('web', 'email', 'whatsapp')),
  status text not null check (status in ('completed', 'failed')),
  intent text,
  retrieved_documents_count integer not null default 0,
  model_name text,
  error_code text,
  latency_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists agent_runs_user_id_idx
  on public.agent_runs (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Email lookup helper (Edge Function / service role فقط)
-- ---------------------------------------------------------------------------
create or replace function public.lookup_user_id_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from auth.users u
  where lower(u.email) = lower(trim(target_email))
  limit 1;
$$;

revoke all on function public.lookup_user_id_by_email(text) from public;
grant execute on function public.lookup_user_id_by_email(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.knowledge_documents enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_runs enable row level security;

drop policy if exists "knowledge_documents_select_active" on public.knowledge_documents;
create policy "knowledge_documents_select_active"
  on public.knowledge_documents for select to authenticated
  using (is_active = true);

drop policy if exists "agent_conversations_select_own" on public.agent_conversations;
create policy "agent_conversations_select_own"
  on public.agent_conversations for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "agent_messages_select_own" on public.agent_messages;
create policy "agent_messages_select_own"
  on public.agent_messages for select to authenticated
  using (
    exists (
      select 1
      from public.agent_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists "agent_runs_select_own" on public.agent_runs;
create policy "agent_runs_select_own"
  on public.agent_runs for select to authenticated
  using (auth.uid() = user_id);

grant select on table public.knowledge_documents to authenticated;
grant select on table public.agent_conversations to authenticated;
grant select on table public.agent_messages to authenticated;
grant select on table public.agent_runs to authenticated;

-- لا INSERT/UPDATE/DELETE للمستخدم على جداول Agent — Edge Function فقط (service role)
