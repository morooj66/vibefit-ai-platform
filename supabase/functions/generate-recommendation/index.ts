import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import { getCorsHeaders } from '../_shared/cors.ts';
import { buildRepairPrompt, buildUserPrompt, SYSTEM_PROMPT } from './prompt.ts';
import {
  openAiJsonSchema,
  validateRecommendationForAssessment,
  type RecommendationOutput,
} from './schema.ts';

const DEFAULT_MODEL = 'gpt-4o-mini';
const REQUEST_TIMEOUT_MS = 55_000;
const RATE_LIMIT_MS = 30_000;

const rateLimitMap = new Map<string, number>();

interface ErrorResponse {
  success: false;
  error: string;
  message: string;
}

interface SuccessResponse {
  success: true;
  recommendation: Record<string, unknown>;
  cached: boolean;
}

type AssessmentRow = {
  id: string;
  user_id: string;
  age: number;
  primary_goal: string;
  experience_level: string;
  activity_level: string;
  training_days_per_week: number;
  session_duration_minutes: number;
  training_location: string;
  equipment: string;
  constraints_notes: string | null;
  notes: string | null;
};

function jsonResponse(
  body: ErrorResponse | SuccessResponse,
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

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const lastRequest = rateLimitMap.get(userId);

  if (lastRequest && now - lastRequest < RATE_LIMIT_MS) {
    return false;
  }

  rateLimitMap.set(userId, now);
  return true;
}

async function callOpenAi(
  apiKey: string,
  model: string,
  userPrompt: string,
  repairPrompt?: string,
): Promise<RecommendationOutput> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const messages = repairPrompt
      ? [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
          { role: 'user', content: repairPrompt },
        ]
      : [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ];

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: openAiJsonSchema,
        },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      console.error('[generate-recommendation] OpenAI request failed', { status });
      throw new Error(`OPENAI_HTTP_${status}`);
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!content || typeof content !== 'string') {
      console.error('[generate-recommendation] OpenAI returned empty content');
      throw new Error('OPENAI_EMPTY_CONTENT');
    }

    return JSON.parse(content) as RecommendationOutput;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function generateValidatedRecommendation(
  apiKey: string,
  model: string,
  assessment: AssessmentRow,
): Promise<RecommendationOutput> {
  const userPrompt = buildUserPrompt(assessment);

  let lastValidationError = 'unknown validation error';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const raw =
        attempt === 0
          ? await callOpenAi(apiKey, model, userPrompt)
          : await callOpenAi(apiKey, model, userPrompt, buildRepairPrompt(lastValidationError));

      return validateRecommendationForAssessment(raw, {
        training_days_per_week: assessment.training_days_per_week,
        session_duration_minutes: assessment.session_duration_minutes,
      });
    } catch (error) {
      lastValidationError =
        error instanceof Error ? error.message : 'validation failed';
      console.error('[generate-recommendation] validation attempt failed', {
        attempt: attempt + 1,
        reason: lastValidationError,
      });
    }
  }

  throw new Error('VALIDATION_FAILED');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'الطريقة غير مدعومة.', 405, origin);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
  const openAiModel = Deno.env.get('OPENAI_MODEL') ?? DEFAULT_MODEL;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.error('[generate-recommendation] missing Supabase env');
    return errorResponse(
      'SERVER_CONFIG',
      'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
      500,
      origin,
    );
  }

  if (!openAiApiKey) {
    console.error('[generate-recommendation] missing OPENAI_API_KEY');
    return errorResponse(
      'AI_UNAVAILABLE',
      'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
      503,
      origin,
    );
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return errorResponse('UNAUTHORIZED', 'يجب تسجيل الدخول.', 401, origin);
  }

  let body: { assessment_id?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('INVALID_REQUEST', 'طلب غير صالح.', 400, origin);
  }

  const assessmentId = body.assessment_id?.trim();
  if (!assessmentId) {
    return errorResponse('INVALID_REQUEST', 'معرّف التقييم مطلوب.', 400, origin);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    console.error('[generate-recommendation] auth failed', {
      code: authError?.code,
    });
    return errorResponse('UNAUTHORIZED', 'يجب تسجيل الدخول.', 401, origin);
  }

  if (!checkRateLimit(user.id)) {
    return errorResponse(
      'RATE_LIMITED',
      'يرجى الانتظار قليلًا قبل إعادة المحاولة.',
      429,
      origin,
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from('assessments')
    .select(
      'id, user_id, age, primary_goal, experience_level, activity_level, training_days_per_week, session_duration_minutes, training_location, equipment, constraints_notes, notes',
    )
    .eq('id', assessmentId)
    .maybeSingle();

  if (assessmentError) {
    console.error('[generate-recommendation] assessment fetch failed', {
      code: assessmentError.code,
    });
    return errorResponse(
      'SERVER_ERROR',
      'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
      500,
      origin,
    );
  }

  if (!assessment) {
    return errorResponse('NOT_FOUND', 'التقييم غير موجود.', 404, origin);
  }

  if (assessment.user_id !== user.id) {
    console.error('[generate-recommendation] forbidden assessment access', {
      userId: user.id,
      assessmentId,
    });
    return errorResponse('FORBIDDEN', 'لا تملك صلاحية هذا التقييم.', 403, origin);
  }

  const { data: existingRecommendation, error: existingError } = await supabaseAdmin
    .from('recommendations')
    .select('*')
    .eq('assessment_id', assessmentId)
    .maybeSingle();

  if (existingError) {
    console.error('[generate-recommendation] recommendation lookup failed', {
      code: existingError.code,
    });
    return errorResponse(
      'SERVER_ERROR',
      'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
      500,
      origin,
    );
  }

  if (
    existingRecommendation?.generation_type === 'ai' &&
    existingRecommendation.status === 'completed'
  ) {
    return jsonResponse(
      {
        success: true,
        recommendation: existingRecommendation,
        cached: true,
      },
      200,
      origin,
    );
  }

  let aiOutput: RecommendationOutput;

  try {
    aiOutput = await generateValidatedRecommendation(
      openAiApiKey,
      openAiModel,
      assessment as AssessmentRow,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';

    if (message === 'VALIDATION_FAILED') {
      return errorResponse(
        'VALIDATION_FAILED',
        'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
        422,
        origin,
      );
    }

    if (message.startsWith('OPENAI_HTTP_401') || message.startsWith('OPENAI_HTTP_403')) {
      return errorResponse(
        'AI_UNAVAILABLE',
        'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
        503,
        origin,
      );
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      return errorResponse(
        'TIMEOUT',
        'انتهت مهلة إنشاء التوصية. حاول مرة أخرى.',
        504,
        origin,
      );
    }

    console.error('[generate-recommendation] AI generation failed', { message });
    return errorResponse(
      'AI_UNAVAILABLE',
      'تعذر إنشاء التوصية الذكية. حاول لاحقًا.',
      503,
      origin,
    );
  }

  const recommendationPayload = {
    user_id: user.id,
    assessment_id: assessmentId,
    summary: aiOutput.summary,
    weekly_plan: aiOutput.weekly_plan,
    nutrition_notes: aiOutput.nutrition_notes,
    safety_notes: aiOutput.safety_notes,
    generation_type: 'ai',
    model_name: openAiModel,
    status: 'completed',
  };

  if (existingRecommendation?.generation_type === 'mock') {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('recommendations')
      .update(recommendationPayload)
      .eq('id', existingRecommendation.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (updateError || !updated) {
      console.error('[generate-recommendation] recommendation update failed', {
        code: updateError?.code,
      });
      return errorResponse(
        'SERVER_ERROR',
        'تعذر حفظ التوصية الذكية. حاول لاحقًا.',
        500,
        origin,
      );
    }

    return jsonResponse(
      { success: true, recommendation: updated, cached: false },
      200,
      origin,
    );
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('recommendations')
    .insert(recommendationPayload)
    .select('*')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      const { data: raced } = await supabaseAdmin
        .from('recommendations')
        .select('*')
        .eq('assessment_id', assessmentId)
        .maybeSingle();

      if (raced) {
        return jsonResponse(
          { success: true, recommendation: raced, cached: true },
          200,
          origin,
        );
      }
    }

    console.error('[generate-recommendation] recommendation insert failed', {
      code: insertError.code,
    });
    return errorResponse(
      'SERVER_ERROR',
      'تعذر حفظ التوصية الذكية. حاول لاحقًا.',
      500,
      origin,
    );
  }

  return jsonResponse(
    { success: true, recommendation: inserted, cached: false },
    200,
    origin,
  );
});
