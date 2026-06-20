-- VibeFit Agent + Email AI Agent — Manual setup (single file)
-- Run in Supabase SQL Editor — safe to re-run
-- Order: 006 → 007 → seed → verification

-- ========================================================================
-- Migration 006 — Knowledge + Agent tables + RAG RPC
-- Source: supabase/migrations/006_create_knowledge_and_agent.sql
-- ========================================================================

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

-- ========================================================================
-- Migration 007 — Email agent events + idempotency RPCs
-- Source: supabase/migrations/007_create_email_agent_events.sql
-- ========================================================================

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

-- ========================================================================
-- Seed — Knowledge base (27 chunks, idempotent)
-- Source: supabase/seed/knowledge-base.sql
-- ========================================================================

-- VibeFit Knowledge Base — Seed (27 مقطع)
-- نفّذ بعد migration 006 من Supabase SQL Editor
-- Full-text RAG — ليس Vector Database
-- آمن لإعادة التشغيل: ON CONFLICT (title, category) DO NOTHING

insert into public.knowledge_documents (title, category, content, source_name, chunk_index)
values
  (
    'أهمية الإحماء قبل التمرين',
    'الإحماء',
    'الإحماء يجهّز الجسم للحركة ويرفع تدفق الدم للعضلات والمفاصل. ابدأ بـ5–10 دقائق من حركة خفيفة ثم تمدد ديناميكي بسيط. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    1
  ),
  (
    'خطوات إحماء آمنة',
    'الإحماء',
    'مثال إحماء: مشي سريع أو ركض خفيف، ثم دوران الكتفين، ورفع الركبتين، وتمدد للفخذين دون ألم. زِد الشدة تدريجيًا حتى تشعر بارتفاع طفيف في التنفس. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    2
  ),
  (
    'التهدئة بعد التمرين',
    'التهدئة',
    'التهدئة تساعد على خفض معدل ضربات القلب تدريجيًا وقد تقلل الشعور بالشد العضلي. خصص 5 دقائق للمشي الخفيف وتمدد بسيط. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    3
  ),
  (
    'تمارين القوة للمبتدئين',
    'تمارين القوة',
    'ابدأ بتمارين مركّبة بسيطة مثل القرفصاء، الضغط، والصف باستخدام وزن الجسم أو أوزان خفيفة. ركّز على الشكل الصحيح قبل زيادة الحمل. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    4
  ),
  (
    'التدرج في الأحمال',
    'تمارين القوة',
    'زِد الحمل أو التكرارات تدريجيًا بنسبة صغيرة (مثل 5–10%) عندما تنجح في جميع المجموعات بشكل مريح. تجنّب القفزات الكبيرة في الشدة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    5
  ),
  (
    'أساسيات الكارديو',
    'الكارديو',
    'الكارديو يحسّن اللياقة القلبية التنفسية. يمكن أن يكون مشيًا، ركضًا خفيفًا، أو دراجة بشدة متوسطة تسمح بالحديث بصعوبة خفيفة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    6
  ),
  (
    'مدة جلسة الكارديو',
    'الكارديو',
    'للمبتدئين، 15–20 دقيقة متواصلة أو على فترات قد تكون كافية للبداية. زِد المدة تدريجيًا حسب تحملك وليس دفعة واحدة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    7
  ),
  (
    'المرونة والتمدد',
    'المرونة',
    'التمدد المنتظم قد يحسّن مدى الحركة ويقلل الشعور بالتيبس. تجنّب التمدد القوي المؤلم. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    8
  ),
  (
    'الراحة بين الجلسات',
    'الراحة والتعافي',
    'العضلات تحتاج راحة للتعافي بعد جلسات القوة. غالبًا يُفضّل يوم راحة أو تمرين خفيف بين جلسات نفس مجموعة العضلات الكبيرة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    9
  ),
  (
    'النوم والتعافي',
    'النوم',
    'النوم الكافي يدعم التعافي والطاقة. حاول ثبات وقت النوم والاستيقاظ. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    10
  ),
  (
    'الترطيب أثناء التمرين',
    'الترطيب',
    'اشرب ماءً قبل وأثناء وبعد التمرين، خاصة في الطقس الحار. العطش علامة على أنك تحتاج سوائل. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    11
  ),
  (
    'نصائح تغذية عامة',
    'التغذية العامة',
    'نوّع مصادر البروتين والنشويات والخضروات دون اتباع حمية قاسية. لا توجد وصفة واحدة تناسب الجميع. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي أو أخصائي تغذية.',
    'VibeFit Knowledge Base',
    12
  ),
  (
    'الالتزام بالخطة',
    'الالتزام',
    'الالتزام أفضل من الكمال. حتى جلسة قصيرة أفضل من التوقف الكامل. سجّل تقدّمك أسبوعيًا لملاحظة الأنماط. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    13
  ),
  (
    'العودة بعد انقطاع',
    'الالتزام',
    'بعد أسبوع غير منتظم، عد بشدة أقل من السابق (حوالي 60–70%) ثم زِد تدريجيًا. لا تحاول تعويض كل الجلسات دفعة واحدة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    14
  ),
  (
    'شدة التمرين المناسبة',
    'شدة التمرين',
    'استخدم مقياس الجهد: 1–10. للتمرين المعتاد، اهدف إلى 6–7 حيث تتحدى نفسك مع الحفاظ على الشكل. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    15
  ),
  (
    'ألم العضلات بعد التمرين',
    'آلام العضلات الطبيعية',
    'الشعور بالتيبس أو الألم الخفيف بعد يوم أو يومين من تمرين جديد قد يكون طبيعيًا (DOMS). يخف عادة خلال أيام. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    16
  ),
  (
    'إشارات تستدعي إيقاف التمرين',
    'إشارات تستدعي إيقاف التمرين',
    'توقف فورًا عند: ألم حاد في الصدر، دوخة شديدة، ضيق تنفس غير معتاد، ألم مفصلي حاد، أو خدر. اطلب مساعدة طبية عند الحاجة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    17
  ),
  (
    'ألم أثناء التمرين وليس بعده',
    'السلامة أثناء التمرين',
    'الألم الحاد أثناء حركة معيّنة ليس «ألمًا طبيعيًا». خفّف الحمل أو أوقف التمرين واستشر مختصًا إذا استمر. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    18
  ),
  (
    'السلامة في المنزل',
    'السلامة أثناء التمرين',
    'وفّر مساحة خالية، أحذية مناسبة، وإضاءة جيدة. تأكد من ثبات الأرضية قبل القفز أو الحركات السريعة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    19
  ),
  (
    'عدد الجلسات الأسبوعية',
    'عدد الجلسات الأسبوعية',
    'للمبتدئين غالبًا 3 جلسات أسبوعيًا نقطة بداية معقولة. يمكن زيادتها تدريجيًا حسب التعافي والهدف. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    20
  ),
  (
    'التدريب للمبتدئين',
    'التدريب للمبتدئين',
    'ركّز على بناء عادة مستمرة قبل رفع الشدة. جلسات قصيرة منتظمة أفضل من جلسات طويلة نادرة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    21
  ),
  (
    'متى تزيد أيام التمرين',
    'عدد الجلسات الأسبوعية',
    'زِد يومًا واحدًا فقط عندما تلتزم بخطة حالية لعدة أسابيع دون إرهاق مستمر أو ألم غير طبيعي. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    22
  ),
  (
    'التحفيز عند انخفاض الطاقة',
    'الالتزام',
    'عند انخفاض الطاقة، جرّب جلسة أقصر أو شدة أقل بدل الإلغاء الكامل. المشي الخفيف أو تمدد قد يحافظ على العادة. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    23
  ),
  (
    'أسئلة شائعة: هل أتمرن يوميًا؟',
    'الأسئلة الشائعة',
    'ليس بالضرورة. يوم راحة أو نشاط خفيف يدعم التعافي. الخطة المناسبة تعتمد على الهدف والمستوى. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    24
  ),
  (
    'أسئلة شائعة: التمارين والألم',
    'الأسئلة الشائعة',
    'التمييز بين إرهاق طبيعي وألم إصابة مهم. الألم الحاد أو المفاجئ يستدعي التوقف والتقييم الطبي. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    25
  ),
  (
    'تفسير صعوبة التمرين',
    'شدة التمرين',
    'إذا شعرت أن كل جلسة «صعبة جدًا»، قد يكون الحمل مرتفعًا. خفّف التكرارات أو خذ راحة أطول بين المجموعات. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    26
  ),
  (
    'احتياطات عامة للسلامة',
    'السلامة أثناء التمرين',
    'استشر طبيبًا قبل بدء برنامج جديد إذا لديك حالة صحية مزمنة أو كنت جديدًا على النشاط البدني المكثف. هذه معلومات عامة وليست بديلًا عن استشارة مختص صحي.',
    'VibeFit Knowledge Base',
    27
  )
on conflict (title, category) do nothing;

-- تحقق: select count(*) from public.knowledge_documents where is_active = true;

-- ========================================================================
-- Verification queries
-- ========================================================================

select count(*) as active_knowledge_documents
from public.knowledge_documents
where is_active = true;

select to_regclass('public.knowledge_documents') as knowledge_documents;
select to_regclass('public.agent_conversations') as agent_conversations;
select to_regclass('public.agent_messages') as agent_messages;
select to_regclass('public.agent_runs') as agent_runs;
select to_regclass('public.email_agent_events') as email_agent_events;

select proname
from pg_proc
where proname in (
  'search_knowledge_documents',
  'lookup_user_id_by_email',
  'check_email_message_processed',
  'check_email_sender_rate_limit',
  'register_email_agent_event'
)
order by proname;

