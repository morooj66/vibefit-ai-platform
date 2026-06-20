import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { getCorsHeaders } from '../_shared/cors.ts';
import { retrieveKnowledgeForIntent } from '../_shared/retrieval.ts';
import { gatherUserContext } from '../vibefit-agent/context.ts';
import {
  buildAppUrl,
  EVENT_CONFIGS,
  goalLabel,
  isValidEventType,
  levelLabel,
  type ProactiveEventType,
} from './events.ts';
import {
  dedupeActions,
  formatProactiveEmail,
  sanitizeEmailText,
  trimToWordLimit,
} from './format.ts';
import { evaluateSendGuardrails, loadEmailPreferences } from './guardrails.ts';
import { buildProactiveUserPrompt, PROACTIVE_SYSTEM_PROMPT } from './prompt.ts';
import {
  buildFallbackEmail,
  buildSkipResponse,
  openAiProactiveJsonSchema,
  proactiveEmailSchema,
  type ProactiveEmailOutput,
} from './schema.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 55_000;
const WEBHOOK_SECRET_HEADER = 'x-vibefit-proactive-secret';
const FUNCTION_NAME = 'vibefit-proactive-agent';

interface ProactiveRequestBody {
  event_type?: string;
  user_id?: string;
  source_record_id?: string;
  event_id?: string;
  channel?: string;
  metadata?: Record<string, unknown>;
}

function jsonResponse(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function verifySecret(req: Request): boolean {
  const expected = Deno.env.get('PROACTIVE_AGENT_SECRET');
  if (!expected) return false;
  const provided = req.headers.get(WEBHOOK_SECRET_HEADER);
  return provided === expected;
}

function buildOperationalFallback(
  eventType: ProactiveEventType,
  displayName: string | null,
  assessment: Record<string, unknown> | null,
  recommendation: Record<string, unknown> | null,
): ProactiveEmailOutput {
  const config = EVENT_CONFIGS[eventType];
  const greeting = displayName ? `أهلًا ${displayName}،` : 'أهلًا بك،';
  const ctaUrl = buildAppUrl(config.ctaPath);

  switch (eventType) {
    case 'user_signed_up':
      return buildFallbackEmail({
        eventType,
        subject: config.defaultSubject,
        greeting,
        body:
          'مرحبًا بك في VibeFit. ابدئي بإكمال التقييم حتى نجهز لك توصية مناسبة لهدفك ومستواك. يمكنك أيضًا استخدام المساعد الذكي لأي سؤال عام عن النشاط والسلامة.',
        actions: ['أكملي التقييم', 'تعرّفي على لوحة التحكم'],
        ctaText: config.ctaText,
        ctaUrl,
        usedPersonalData: Boolean(displayName),
        usedRag: false,
      });
    case 'assessment_completed':
      return buildFallbackEmail({
        eventType,
        subject: config.defaultSubject,
        greeting,
        body: `استلمنا تقييمك بنجاح. هدفك: ${goalLabel(String(assessment?.primary_goal ?? ''))}. المستوى: ${levelLabel(String(assessment?.experience_level ?? ''))}. أيام التدريب: ${String(assessment?.training_days_per_week ?? '—')}. نجهّز الآن توصيتك الأسبوعية.`,
        actions: ['تابعي لوحة التحكم', 'جهّزي جدولًا بسيطًا للأسبوع'],
        ctaText: config.ctaText,
        ctaUrl,
        usedPersonalData: true,
        usedRag: false,
      });
    case 'recommendation_completed': {
      const weeklyPlan = recommendation?.weekly_plan as Record<string, unknown> | undefined;
      const days = Array.isArray(weeklyPlan?.days) ? weeklyPlan!.days.length : null;
      return buildFallbackEmail({
        eventType,
        subject: config.defaultSubject,
        greeting,
        body: `خطتك الأسبوعية جاهزة${days ? ` (${days} أيام)` : ''}. ${String(recommendation?.summary ?? '').slice(0, 160)}`,
        actions: ['افتحي الخطة', 'ابدئي بجلسة خفيفة'],
        ctaText: config.ctaText,
        ctaUrl,
        usedPersonalData: true,
        usedRag: false,
      });
    }
    default:
      return buildFallbackEmail({
        eventType,
        subject: config.defaultSubject,
        greeting,
        body: 'لدينا تحديث مرتبط برحلتك في VibeFit. يمكنك متابعة خطتك أو تسجيل متابعة أسبوعية قصيرة.',
        actions: ['افتحي لوحة التحكم', 'سجّلي متابعتك'],
        ctaText: config.ctaText,
        ctaUrl,
        usedPersonalData: true,
        usedRag: false,
      });
  }
}

async function callOpenAi(params: {
  eventType: ProactiveEventType;
  userPrompt: string;
  apiKey: string;
}): Promise<{ parsed: ProactiveEmailOutput | null; raw: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL,
        temperature: 0.55,
        response_format: {
          type: 'json_schema',
          json_schema: openAiProactiveJsonSchema,
        },
        messages: [
          { role: 'system', content: PROACTIVE_SYSTEM_PROMPT },
          { role: 'user', content: params.userPrompt },
        ],
      }),
      signal: controller.signal,
    });

    const payload = await response.json();
    if (!response.ok) {
      console.error('[proactive-agent] OpenAI error', { status: response.status });
      return { parsed: null, raw: null };
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { parsed: null, raw: null };

    try {
      const normalized = proactiveEmailSchema.safeParse(JSON.parse(content));
      if (normalized.success) {
        return { parsed: normalized.data, raw: content };
      }
    } catch {
      // fall through
    }

    return { parsed: null, raw: content };
  } catch (error) {
    console.error('[proactive-agent] OpenAI request failed', {
      name: error instanceof Error ? error.name : 'unknown',
    });
    return { parsed: null, raw: null };
  } finally {
    clearTimeout(timeout);
  }
}

function finalizeOutput(
  output: ProactiveEmailOutput,
  config: (typeof EVENT_CONFIGS)[ProactiveEventType],
): ProactiveEmailOutput {
  if (!output.should_send) return output;

  const ctaUrl = output.cta_url?.trim() || buildAppUrl(config.ctaPath);
  const subject = sanitizeEmailText(output.subject ?? config.defaultSubject);
  const greeting = sanitizeEmailText(output.greeting ?? 'أهلًا،');
  const body = trimToWordLimit(
    sanitizeEmailText(output.body ?? ''),
    config.maxWords,
  );
  const actions = dedupeActions(output.recommended_actions ?? [], 4);

  return {
    ...output,
    subject,
    greeting,
    body,
    recommended_actions: actions,
    cta_text: sanitizeEmailText(output.cta_text ?? config.ctaText),
    cta_url: ctaUrl,
    footer_notice: output.footer_notice ?? 'هذه توصيات عامة وليست تشخيصًا طبيًا.',
    used_personal_data: Boolean(output.used_personal_data),
    used_rag: Boolean(output.used_rag),
    reason_not_sent: null,
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResponse(
      { success: false, error: 'METHOD_NOT_ALLOWED', message: 'POST فقط' },
      405,
      origin,
    );
  }

  if (!verifySecret(req)) {
    return jsonResponse(
      { success: false, error: 'UNAUTHORIZED', message: 'Webhook غير مصرح' },
      401,
      origin,
    );
  }

  const openAiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAiKey) {
    return jsonResponse(
      {
        success: false,
        error: 'CONFIG_MISSING',
        message: 'خدمة البريد الذكي غير مهيأة حاليًا.',
      },
      503,
      origin,
    );
  }

  let body: ProactiveRequestBody;
  try {
    body = (await req.json()) as ProactiveRequestBody;
  } catch {
    return jsonResponse(
      { success: false, error: 'INVALID_JSON', message: 'طلب غير صالح' },
      400,
      origin,
    );
  }

  const eventTypeRaw = String(body.event_type ?? '').trim();
  if (!isValidEventType(eventTypeRaw)) {
    return jsonResponse(
      { success: false, error: 'INVALID_EVENT', message: 'نوع الحدث غير مدعوم' },
      400,
      origin,
    );
  }

  const eventType = eventTypeRaw;
  const userId = String(body.user_id ?? '').trim();
  if (!isUuid(userId)) {
    return jsonResponse(
      { success: false, error: 'INVALID_USER', message: 'معرف المستخدم غير صالح' },
      400,
      origin,
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(
      { success: false, error: 'CONFIG_MISSING', message: 'إعدادات الخادم ناقصة' },
      503,
      origin,
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const config = EVENT_CONFIGS[eventType];
  const preferences = await loadEmailPreferences(supabaseAdmin, userId);
  const guardrails = await evaluateSendGuardrails(
    supabaseAdmin,
    userId,
    eventType,
    config,
    preferences,
  );

  if (!guardrails.allowed) {
    const skip = buildSkipResponse(eventType, guardrails.reason ?? 'blocked');
    return jsonResponse({ success: true, ...skip }, 200, origin);
  }

  const userContext = await gatherUserContext(supabaseAdmin, userId, true);
  const displayName = (userContext.profile?.display_name as string | undefined)?.trim() ?? null;
  const eventMetadata = body.metadata ?? {};

  let knowledgeSnippets: string[] = [];
  let usedRag = false;

  if (config.useRag && config.ragCategories.length > 0) {
    const query =
      eventType === 'low_energy_detected'
        ? 'تعافي طاقة إجهاد نوم'
        : eventType === 'high_difficulty_detected'
          ? 'تخفيف شدة تمرين تدرج'
          : eventType === 'adherence_dropped'
            ? 'عودة للخطة التزام تدريجي'
            : eventType === 'weekly_summary_due'
              ? 'ملخص أسبوع التزام استمرارية'
              : 'نشاط لياقة التزام';

    try {
      const retrieval = await retrieveKnowledgeForIntent(
        supabaseAdmin,
        query,
        config.ragCategories,
      );
      knowledgeSnippets = retrieval.documents.map(
        (doc) => `${doc.title}: ${doc.content.slice(0, 180)}`,
      );
      usedRag = knowledgeSnippets.length > 0;
    } catch {
      knowledgeSnippets = [];
      usedRag = false;
    }
  }

  const ctaUrl = buildAppUrl(config.ctaPath);
  const userPrompt = buildProactiveUserPrompt({
    eventType,
    eventMetadata,
    userContext,
    knowledgeSnippets,
    ctaUrl,
    ctaText: config.ctaText,
    defaultSubject: config.defaultSubject,
  });

  const openAiResult = await callOpenAi({
    eventType,
    userPrompt,
    apiKey: openAiKey,
  });

  let output: ProactiveEmailOutput;

  if (openAiResult.parsed) {
    output = finalizeOutput(openAiResult.parsed, config);
    if (output.should_send && !output.body?.trim()) {
      output = buildOperationalFallback(
        eventType,
        displayName,
        userContext.assessment,
        userContext.recommendation,
      );
    }
  } else if (config.category === 'operational') {
    output = buildOperationalFallback(
      eventType,
      displayName,
      userContext.assessment,
      userContext.recommendation,
    );
  } else {
    output = buildFallbackEmail({
      eventType,
      subject: config.defaultSubject,
      greeting: displayName ? `أهلًا ${displayName}،` : 'أهلًا،',
      body: trimToWordLimit(
        'نقدر نرجع تدريجيًا — الاستمرارية أهم من الكمال. جلسة خفيفة أفضل من الانقطاع.',
        config.maxWords,
      ),
      actions: ['ابدئي بخطوة صغيرة', 'سجّلي متابعتك الأسبوعية'],
      ctaText: config.ctaText,
      ctaUrl,
      usedPersonalData: userContext.hasPersonalData,
      usedRag,
    });
  }

  if (usedRag && !output.used_rag) {
    output.used_rag = true;
  }
  if (userContext.hasPersonalData && !output.used_personal_data) {
    output.used_personal_data = true;
  }

  const formattedEmail = output.should_send
    ? formatProactiveEmail({
        greeting: output.greeting ?? 'أهلًا،',
        body: output.body ?? '',
        recommended_actions: output.recommended_actions,
        cta_text: output.cta_text ?? config.ctaText,
        cta_url: output.cta_url ?? ctaUrl,
        footer_notice: output.footer_notice,
      })
    : null;

  if (body.event_id && isUuid(body.event_id)) {
    try {
      await supabaseAdmin.rpc('update_proactive_event_status', {
        p_event_id: body.event_id,
        p_status: output.should_send ? 'processing' : 'skipped',
        p_error_code: output.should_send ? null : output.reason_not_sent,
        p_email_message_id: null,
      });
    } catch {
      // non-blocking
    }
  }

  console.info(`[${FUNCTION_NAME}] completed`, {
    eventType,
    shouldSend: output.should_send,
    usedRag: output.used_rag,
    usedPersonalData: output.used_personal_data,
  });

  return jsonResponse(
    {
      success: true,
      user_id: userId,
      event_id: body.event_id ?? null,
      formatted_email: formattedEmail,
      ...output,
    },
    200,
    origin,
  );
});
