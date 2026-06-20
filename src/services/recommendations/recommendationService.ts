import { supabase } from '../../lib/supabase';
import { logSupabaseError } from '../../lib/supabaseDebug';
import type { Assessment, Recommendation } from '../../types/recommendation';
import { generateMockRecommendation } from './generateMockRecommendation';

const FETCH_ERROR_MESSAGE = 'تعذر تحميل بياناتك. حاول مرة أخرى.';
const CREATE_ERROR_MESSAGE = 'تعذر إعداد التوصية. حاول مرة أخرى.';
const AI_ERROR_MESSAGE = 'تعذر إنشاء التوصية الذكية. حاول مرة أخرى.';
const AI_TIMEOUT_MESSAGE = 'انتهت مهلة إنشاء التوصية. حاول مرة أخرى.';
const MOCK_CONSENT_MESSAGE =
  'تعذر إنشاء التوصية الذكية. هل تريد استخدام توصية تجريبية مؤقتة؟';

const AI_TIMEOUT_MS = 60_000;

export type AiRecommendationErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'AI_UNAVAILABLE'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'SERVER_ERROR'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export class RecommendationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecommendationServiceError';
  }
}

export class AiRecommendationError extends RecommendationServiceError {
  code: AiRecommendationErrorCode;

  constructor(code: AiRecommendationErrorCode, message: string) {
    super(message);
    this.name = 'AiRecommendationError';
    this.code = code;
  }
}

interface EdgeSuccessResponse {
  success: true;
  recommendation: Recommendation;
  cached?: boolean;
}

interface EdgeErrorResponse {
  success: false;
  error?: string;
  message?: string;
}

function mapEdgeErrorCode(error?: string): AiRecommendationErrorCode {
  switch (error) {
    case 'UNAUTHORIZED':
      return 'UNAUTHORIZED';
    case 'FORBIDDEN':
      return 'FORBIDDEN';
    case 'NOT_FOUND':
      return 'NOT_FOUND';
    case 'VALIDATION_FAILED':
      return 'VALIDATION_FAILED';
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'RATE_LIMITED':
      return 'RATE_LIMITED';
    case 'AI_UNAVAILABLE':
    case 'SERVER_CONFIG':
      return 'AI_UNAVAILABLE';
    case 'SERVER_ERROR':
      return 'SERVER_ERROR';
    case 'INVALID_REQUEST':
      return 'INVALID_REQUEST';
    default:
      return 'UNKNOWN';
  }
}

function mapEdgeErrorMessage(code: AiRecommendationErrorCode): string {
  switch (code) {
    case 'UNAUTHORIZED':
      return 'انتهت جلستك. سجّل الدخول مرة أخرى.';
    case 'FORBIDDEN':
      return 'لا تملك صلاحية هذا التقييم.';
    case 'NOT_FOUND':
      return 'التقييم غير موجود.';
    case 'VALIDATION_FAILED':
    case 'AI_UNAVAILABLE':
    case 'SERVER_ERROR':
    case 'INVALID_REQUEST':
    case 'UNKNOWN':
      return AI_ERROR_MESSAGE;
    case 'TIMEOUT':
      return AI_TIMEOUT_MESSAGE;
    case 'RATE_LIMITED':
      return 'يرجى الانتظار قليلًا قبل إعادة المحاولة.';
    default:
      return AI_ERROR_MESSAGE;
  }
}

async function getLatestAssessmentByUserId(userId: string): Promise<Assessment | null> {
  const { data, error } = await supabase
    .from('assessments')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError('assessments.selectLatest', error);
    throw new RecommendationServiceError(FETCH_ERROR_MESSAGE);
  }

  return data;
}

async function getRecommendationByAssessmentId(
  assessmentId: string,
): Promise<Recommendation | null> {
  const { data, error } = await supabase
    .from('recommendations')
    .select('*')
    .eq('assessment_id', assessmentId)
    .maybeSingle();

  if (error) {
    logSupabaseError('recommendations.selectByAssessment', error);
    throw new RecommendationServiceError(FETCH_ERROR_MESSAGE);
  }

  return data;
}

function invokeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new AiRecommendationError('TIMEOUT', AI_TIMEOUT_MESSAGE));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * يستدعي Edge Function الآمنة ويرسل assessment_id فقط.
 */
export async function generateAiRecommendation(assessmentId: string): Promise<Recommendation> {
  const invokePromise = supabase.functions.invoke('generate-recommendation', {
    body: { assessment_id: assessmentId },
  });

  const { data, error } = await invokeWithTimeout(invokePromise, AI_TIMEOUT_MS);

  const payload = data as EdgeSuccessResponse | EdgeErrorResponse | null;

  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === true && payload.recommendation) {
      return payload.recommendation;
    }

    if (payload.success === false) {
      const code = mapEdgeErrorCode(payload.error);
      throw new AiRecommendationError(code, mapEdgeErrorMessage(code));
    }
  }

  if (error) {
    logSupabaseError('functions.generate-recommendation', error);
    throw new AiRecommendationError('AI_UNAVAILABLE', AI_ERROR_MESSAGE);
  }

  throw new AiRecommendationError('UNKNOWN', AI_ERROR_MESSAGE);
}

/**
 * Mock fallback — يُستخدم فقط بعد موافقة المستخدم الصريحة.
 */
export async function ensureMockRecommendation(
  assessment: Assessment,
): Promise<Recommendation> {
  const existing = await getRecommendationByAssessmentId(assessment.id);
  if (existing) {
    return existing;
  }

  const mock = generateMockRecommendation(assessment);

  const { data, error } = await supabase
    .from('recommendations')
    .insert({
      user_id: assessment.user_id,
      assessment_id: assessment.id,
      summary: mock.summary,
      weekly_plan: mock.weekly_plan,
      nutrition_notes: mock.nutrition_notes,
      safety_notes: mock.safety_notes,
      generation_type: 'mock',
      status: 'completed',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      const raced = await getRecommendationByAssessmentId(assessment.id);
      if (raced) {
        return raced;
      }
    }
    logSupabaseError('recommendations.insert', error);
    throw new RecommendationServiceError(CREATE_ERROR_MESSAGE);
  }

  return data;
}

export async function loadDashboardData(userId: string): Promise<{
  assessment: Assessment | null;
  recommendation: Recommendation | null;
}> {
  const assessment = await getLatestAssessmentByUserId(userId);

  if (!assessment) {
    return { assessment: null, recommendation: null };
  }

  const recommendation = await getRecommendationByAssessmentId(assessment.id);
  return { assessment, recommendation };
}

export async function createAiRecommendationForLatestAssessment(
  userId: string,
): Promise<{ assessment: Assessment; recommendation: Recommendation }> {
  const assessment = await getLatestAssessmentByUserId(userId);

  if (!assessment) {
    throw new RecommendationServiceError('لا يوجد تقييم محفوظ.');
  }

  const recommendation = await generateAiRecommendation(assessment.id);
  return { assessment, recommendation };
}

/** @deprecated استخدم createAiRecommendationForLatestAssessment */
export async function createRecommendationForLatestAssessment(
  userId: string,
): Promise<{ assessment: Assessment; recommendation: Recommendation }> {
  return createAiRecommendationForLatestAssessment(userId);
}

export {
  FETCH_ERROR_MESSAGE,
  CREATE_ERROR_MESSAGE,
  AI_ERROR_MESSAGE,
  AI_TIMEOUT_MESSAGE,
  MOCK_CONSENT_MESSAGE,
};
