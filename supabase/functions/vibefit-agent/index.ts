import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { getCorsHeaders } from '../_shared/cors.ts';
import {
  retrieveKnowledgeForIntent,
  toAgentSources,
  type RetrievedDocument,
} from '../_shared/retrieval.ts';
import { gatherUserContext } from './context.ts';
import type { AgentIntent } from './intent.ts';
import { planAgentTools, resolveUsedFlags } from './orchestration.ts';
import { AGENT_SYSTEM_PROMPT, buildAgentUserPrompt } from './prompt.ts';
import {
  agentResponseSchema,
  buildResponseFromRawText,
  buildSafeFallbackResponse,
  normalizeLegacyResponse,
  openAiAgentJsonSchema,
  type AgentResponse,
} from './schema.ts';
import {
  hashExternalSender,
  INJECTION_REFUSAL,
  MEDICAL_SAFETY_NOTICE,
  validateIncomingMessage,
} from './safety.ts';
import { formatAgentResponse } from './responseFormat.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 55_000;
const RATE_LIMIT_MS = 8_000;
const WEBHOOK_SECRET_HEADER = 'x-vibefit-agent-secret';
const FUNCTION_NAME = 'vibefit-agent';

const rateLimitMap = new Map<string, number>();

type Channel = 'web' | 'email' | 'whatsapp';

interface AgentRequestBody {
  message?: string;
  channel?: Channel;
  conversation_id?: string;
  external_sender?: string;
}

interface SuccessPayload {
  success: true;
  user_found: boolean;
  conversation_id: string;
  response: AgentResponse;
}

interface ErrorPayload {
  success: false;
  error: string;
  message: string;
}

function jsonResponse(
  body: SuccessPayload | ErrorPayload,
  status: number,
  origin: string | null,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

function errorResponse(
  error: string,
  message: string,
  status: number,
  origin: string | null,
): Response {
  return jsonResponse({ success: false, error, message }, status, origin);
}

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const last = rateLimitMap.get(key);
  if (last && now - last < RATE_LIMIT_MS) return false;
  rateLimitMap.set(key, now);
  return true;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function resolveUserFromEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) return null;

  const { data, error } = await supabaseAdmin.rpc('lookup_user_id_by_email', {
    target_email: normalizedEmail,
  });

  if (error) {
    console.error('[vibefit-agent] email lookup failed', { code: error.code });
    return null;
  }

  return typeof data === 'string' ? data : null;
}

function sanitizeSources(
  response: AgentResponse,
  knowledge: RetrievedDocument[],
): AgentResponse {
  const allowedTitles = new Set(knowledge.map((doc) => doc.title));
  const filtered = response.sources.filter((source) => allowedTitles.has(source.title));
  const usedRag = filtered.length > 0;

  return {
    ...response,
    sources: filtered.slice(0, 3),
    used_rag: usedRag,
  };
}

function finalizeResponse(
  response: AgentResponse,
  intent: AgentIntent,
  knowledge: RetrievedDocument[],
  usedPersonalData: boolean,
): AgentResponse {
  const withSources = sanitizeSources(response, knowledge);
  return formatAgentResponse(withSources, intent, usedPersonalData);
}

async function callOpenAiPlainText(
  apiKey: string,
  model: string,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.65,
        messages: [
          { role: 'system', content: AGENT_SYSTEM_PROMPT },
          { role: 'user', content: `${userPrompt}\n\nأجب بالعربية فقط كنص طبيعي بدون JSON.` },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OPENAI_HTTP_${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('OPENAI_EMPTY_CONTENT');
    }

    return content.trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAiAgent(params: {
  apiKey: string;
  model: string;
  userPrompt: string;
  intent: AgentIntent;
  knowledge: RetrievedDocument[];
  usedPersonalData: boolean;
  usedRag: boolean;
  safetyNotice?: string | null;
}): Promise<AgentResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const knowledgeTitles = new Set(params.knowledge.map((doc) => doc.title));
  const ragSources = toAgentSources(params.knowledge);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.65,
        messages: [
          { role: 'system', content: AGENT_SYSTEM_PROMPT },
          { role: 'user', content: params.userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: openAiAgentJsonSchema,
        },
      }),
    });

    if (!response.ok) {
      console.error('[vibefit-agent] OpenAI structured request failed', {
        status: response.status,
      });
      throw new Error(`OPENAI_HTTP_${response.status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      throw new Error('OPENAI_EMPTY_CONTENT');
    }

    try {
      const normalized = normalizeLegacyResponse(JSON.parse(content));
      const parsed = agentResponseSchema.safeParse(normalized);
      if (parsed.success) {
        return sanitizeSources(parsed.data, params.knowledge);
      }
      console.warn('[vibefit-agent] schema validation failed, using raw extraction');
    } catch {
      console.warn('[vibefit-agent] JSON parse failed, using raw extraction');
    }

    return sanitizeSources(
      buildResponseFromRawText({
        content,
        intent: params.intent,
        knowledgeTitles,
        sources: ragSources,
        usedPersonalData: params.usedPersonalData,
        usedRag: params.usedRag,
        safetyNotice: params.safetyNotice,
      }),
      params.knowledge,
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateAgentResponse(params: {
  apiKey: string;
  model: string;
  userPrompt: string;
  intent: AgentIntent;
  knowledge: RetrievedDocument[];
  usedPersonalData: boolean;
  usedRag: boolean;
  requireSafetyNotice: boolean;
}): Promise<AgentResponse> {
  const safetyNotice = params.requireSafetyNotice ? MEDICAL_SAFETY_NOTICE : null;

  try {
    return await callOpenAiAgent({
      apiKey: params.apiKey,
      model: params.model,
      userPrompt: params.userPrompt,
      intent: params.intent,
      knowledge: params.knowledge,
      usedPersonalData: params.usedPersonalData,
      usedRag: params.usedRag,
      safetyNotice,
    });
  } catch (structuredError) {
    console.error('[vibefit-agent] structured generation failed', {
      error: structuredError instanceof Error ? structuredError.message : 'UNKNOWN',
    });
  }

  try {
    const rawText = await callOpenAiPlainText(params.apiKey, params.model, params.userPrompt);
    return sanitizeSources(
      buildResponseFromRawText({
        content: rawText,
        intent: params.intent,
        knowledgeTitles: new Set(params.knowledge.map((doc) => doc.title)),
        sources: toAgentSources(params.knowledge),
        usedPersonalData: params.usedPersonalData,
        usedRag: params.usedRag,
        safetyNotice,
      }),
      params.knowledge,
    );
  } catch (plainError) {
    console.error('[vibefit-agent] plain text generation failed', {
      error: plainError instanceof Error ? plainError.message : 'UNKNOWN',
    });
  }

  if (params.intent === 'medical_boundary') {
    return buildSafeFallbackResponse(
      params.intent,
      'ألم حاد أو أعراض مقلقة أثناء التمرين قد تتطلب تقييمًا طبيًا. توقف عن النشاط المسبب للألم وتواصل مع مختص صحي.',
      MEDICAL_SAFETY_NOTICE,
      [
        'أوقف التمرين المؤلم فورًا.',
        'لا تكمل الحركة التي تسبب الألم.',
        'استشر طبيبًا أو مختصًا قبل العودة للنشاط.',
      ],
    );
  }

  return buildSafeFallbackResponse(
    params.intent,
    'تعذر إنشاء إجابة كاملة الآن بسبب مشكلة مؤقتة. حاول إعادة صياغة سؤالك أو أعد المحاولة لاحقًا.',
  );
}

function buildInjectionResponse(): AgentResponse {
  return {
    ...buildSafeFallbackResponse(
      'prompt_injection',
      INJECTION_REFUSAL,
      undefined,
      ['اسأل عن التمرين، خطتك، أو التزامك الأسبوعي.'],
    ),
    used_rag: false,
    used_personal_data: false,
  };
}

async function ensureConversation(
  supabaseAdmin: ReturnType<typeof createClient>,
  params: {
    conversationId?: string;
    externalThreadId?: string | null;
    userId: string | null;
    channel: Channel;
    externalSenderHash?: string | null;
  },
): Promise<string> {
  if (params.channel === 'email' && params.externalThreadId) {
    const { data: threadConversation } = await supabaseAdmin
      .from('agent_conversations')
      .select('id')
      .eq('channel', 'email')
      .eq('external_thread_id', params.externalThreadId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadConversation?.id) {
      await supabaseAdmin
        .from('agent_conversations')
        .update({ updated_at: new Date().toISOString(), user_id: params.userId })
        .eq('id', threadConversation.id);
      return threadConversation.id as string;
    }
  }

  if (params.conversationId && isUuid(params.conversationId)) {
    const { data } = await supabaseAdmin
      .from('agent_conversations')
      .select('id')
      .eq('id', params.conversationId)
      .maybeSingle();

    if (data?.id) {
      await supabaseAdmin
        .from('agent_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', data.id);
      return data.id as string;
    }
  }

  const { data, error } = await supabaseAdmin
    .from('agent_conversations')
    .insert({
      user_id: params.userId,
      channel: params.channel,
      external_sender_hash: params.externalSenderHash ?? null,
      external_thread_id: params.externalThreadId ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('CONVERSATION_CREATE_FAILED');
  }

  return data.id as string;
}

async function persistMessages(
  supabaseAdmin: ReturnType<typeof createClient>,
  conversationId: string,
  userMessage: string,
  response: AgentResponse,
  intent: AgentIntent,
): Promise<void> {
  await supabaseAdmin.from('agent_messages').insert([
    {
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
      intent,
      used_rag: false,
      used_personal_data: false,
      sources: [],
    },
    {
      conversation_id: conversationId,
      role: 'assistant',
      content: response.answer,
      intent: response.intent,
      used_rag: response.used_rag,
      used_personal_data: response.used_personal_data,
      sources: response.sources,
    },
  ]);
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');
  const startedAt = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'الطريقة غير مدعومة.', 405, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const openAiModel = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL;
  const webhookSecret = Deno.env.get('AGENT_WEBHOOK_SECRET');

  if (!supabaseUrl || !supabaseServiceRoleKey || !openAiApiKey) {
    console.error('[vibefit-agent] missing server configuration', {
      hasUrl: Boolean(supabaseUrl),
      hasServiceRole: Boolean(supabaseServiceRoleKey),
      hasOpenAiKey: Boolean(openAiApiKey),
    });
    return errorResponse(
      'SERVER_ERROR',
      'الخدمة غير مهيأة. حاول لاحقًا.',
      500,
      origin,
    );
  }

  let body: AgentRequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_JSON', 'تنسيق الطلب غير صالح.', 400, origin);
  }

  const channel: Channel =
    body.channel === 'email' || body.channel === 'whatsapp' ? body.channel : 'web';

  const validated = validateIncomingMessage(body.message);
  if ('error' in validated) {
    const messages: Record<string, string> = {
      EMPTY_MESSAGE: 'الرسالة فارغة.',
      MESSAGE_TOO_LONG: 'الرسالة طويلة جدًا.',
      INVALID_MESSAGE: 'الرسالة غير صالحة.',
    };
    return errorResponse(validated.error, messages[validated.error] ?? 'رسالة غير صالحة.', 400, origin);
  }

  const userMessage = validated.message;
  let userId: string | null = null;

  if (channel === 'web') {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'يلزم تسجيل الدخول.', 401, origin);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey ?? supabaseServiceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData.user) {
      return errorResponse('UNAUTHORIZED', 'جلسة غير صالحة.', 401, origin);
    }

    userId = userData.user.id;
  } else {
    const providedSecret = req.headers.get(WEBHOOK_SECRET_HEADER);
    if (!webhookSecret || providedSecret !== webhookSecret) {
      return errorResponse('UNAUTHORIZED', 'Webhook غير مصرح.', 401, origin);
    }
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  let externalSenderHash: string | null = null;
  if (channel !== 'web' && body.external_sender) {
    const normalizedSender = body.external_sender.trim().toLowerCase();
    externalSenderHash = await hashExternalSender(normalizedSender);
    if (!userId && normalizedSender.includes('@')) {
      userId = await resolveUserFromEmail(supabaseAdmin, normalizedSender);
    }
  }

  const rateLimitKey = userId ?? externalSenderHash ?? req.headers.get('x-forwarded-for') ?? 'anon';
  if (!checkRateLimit(rateLimitKey)) {
    return errorResponse('RATE_LIMIT', 'انتظر قليلًا قبل إرسال رسالة أخرى.', 429, origin);
  }

  const tools = planAgentTools(userMessage, Boolean(userId));
  const { intent } = tools;

  let knowledge: RetrievedDocument[] = [];
  if (tools.useRag) {
    const retrieval = await retrieveKnowledgeForIntent(
      supabaseAdmin,
      userMessage,
      tools.ragCategories,
    );
    knowledge = retrieval.documents;
  }

  const userContext = await gatherUserContext(
    supabaseAdmin,
    userId ?? '',
    tools.usePersonalData,
  );

  let agentResponse: AgentResponse;
  let runStatus: 'completed' | 'failed' = 'completed';
  let errorCode: string | null = null;

  if (intent === 'prompt_injection') {
    agentResponse = buildInjectionResponse();
  } else {
    const userPrompt = buildAgentUserPrompt({
      userMessage,
      intent,
      tools,
      knowledgeChunks: knowledge,
      userContext,
    });

    const usedPersonalData = tools.usePersonalData && userContext.hasPersonalData;
    const preliminaryUsedRag = knowledge.length > 0;

    try {
      agentResponse = await generateAgentResponse({
        apiKey: openAiApiKey,
        model: openAiModel,
        userPrompt,
        intent,
        knowledge,
        usedPersonalData,
        usedRag: preliminaryUsedRag,
        requireSafetyNotice: tools.requireSafetyNotice,
      });

      agentResponse.intent = intent;
      agentResponse.used_personal_data = usedPersonalData;

      if (tools.requireSafetyNotice) {
        agentResponse.safety_notice = agentResponse.safety_notice ?? MEDICAL_SAFETY_NOTICE;
      }

      const flags = resolveUsedFlags({
        knowledge,
        userContext,
        usePersonalData: tools.usePersonalData,
        responseSources: agentResponse.sources,
      });

      agentResponse.used_rag = flags.usedRag;
      agentResponse.used_personal_data = flags.usedPersonalData;
      agentResponse = sanitizeSources(agentResponse, knowledge);
    } catch (error) {
      runStatus = 'failed';
      errorCode = error instanceof Error ? error.message : 'AGENT_FAILED';
      console.error('[vibefit-agent] generation failed', { errorCode });
      agentResponse = buildSafeFallbackResponse(
        intent,
        'واجهت مشكلة مؤقتة في توليد الإجابة. حاول مرة أخرى بعد قليل.',
      );
    }
  }

  if (!agentResponse.answer?.trim()) {
    runStatus = 'failed';
    errorCode = errorCode ?? 'EMPTY_ANSWER';
    agentResponse = buildSafeFallbackResponse(
      intent,
      'لم أتمكن من صياغة إجابة واضحة. جرّب إعادة صياغة سؤالك.',
    );
  }

  if (intent !== 'prompt_injection') {
    agentResponse = finalizeResponse(
      agentResponse,
      intent,
      knowledge,
      agentResponse.used_personal_data,
    );
  }

  let conversationId = '';
  const externalThreadId =
    channel === 'email' && body.conversation_id && !isUuid(body.conversation_id)
      ? body.conversation_id
      : null;
  const conversationUuid =
    body.conversation_id && isUuid(body.conversation_id) ? body.conversation_id : undefined;

  try {
    conversationId = await ensureConversation(supabaseAdmin, {
      conversationId: conversationUuid,
      externalThreadId,
      userId,
      channel,
      externalSenderHash,
    });
    await persistMessages(supabaseAdmin, conversationId, userMessage, agentResponse, intent);
  } catch {
    console.error('[vibefit-agent] persistence failed');
  }

  try {
    await supabaseAdmin.from('agent_runs').insert({
      conversation_id: conversationId || null,
      user_id: userId,
      channel,
      status: runStatus,
      intent,
      retrieved_documents_count: knowledge.length,
      model_name: openAiModel,
      error_code: errorCode,
      latency_ms: Date.now() - startedAt,
    });
  } catch {
    console.error('[vibefit-agent] agent_runs insert failed');
  }

  return jsonResponse(
    {
      success: true,
      user_found: Boolean(userId),
      conversation_id: conversationId,
      response: agentResponse,
    },
    200,
    origin,
  );
});
