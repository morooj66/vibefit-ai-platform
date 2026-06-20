export interface AgentSource {
  title: string;
  category: string;
  source_name: string;
}

export interface AgentStructuredResponse {
  answer: string;
  intent: string;
  sources: AgentSource[];
  insights: string[];
  recommended_actions: string[];
  /** @deprecated legacy single action — normalized at runtime */
  recommended_action?: string;
  safety_notice?: string | null;
  used_personal_data: boolean;
  used_rag: boolean;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  response?: AgentStructuredResponse;
  createdAt: string;
}

export interface AgentSuccessResponse {
  success: true;
  user_found?: boolean;
  conversation_id: string;
  response: AgentStructuredResponse;
}

export interface AgentErrorResponse {
  success: false;
  error: string;
  message: string;
}

export const AGENT_SUGGESTED_PROMPTS = [
  'كيف كان التزامي هذا الشهر؟',
  'كيف أعود للخطة بعد أسبوع غير منتظم؟',
  'اشرح لي أهمية الإحماء.',
  'حلل لي سبب انخفاض طاقتي',
  'اشرح لي اليوم الأول بشكل أبسط',
] as const;

export function normalizeAgentResponse(response: AgentStructuredResponse): AgentStructuredResponse {
  const actions =
    response.recommended_actions?.length > 0
      ? response.recommended_actions
      : response.recommended_action
        ? [response.recommended_action]
        : [];

  return {
    ...response,
    recommended_actions: actions,
  };
}

export function getIntentLabel(intent: string): string {
  const labels: Record<string, string> = {
    fitness_general: 'إرشاد عام',
    plan_question: 'الخطة الشخصية',
    progress_analysis: 'تحليل التقدم',
    exercise_explanation: 'شرح تمرين',
    motivation_and_adherence: 'الالتزام والتحفيز',
    recovery_and_fatigue: 'التعافي والطاقة',
    nutrition_general: 'تغذية عامة',
    safety: 'سلامة',
    medical_boundary: 'حدود طبية',
    open_question: 'سؤال مفتوح',
    prompt_injection: 'مرفوض',
    general_fitness: 'إرشاد عام',
    personal_plan: 'الخطة الشخصية',
    progress_review: 'مراجعة التقدم',
    motivation: 'تحفيز',
    medical_risk: 'تنبيه سلامة',
    unsupported: 'سؤال مفتوح',
  };
  return labels[intent] ?? intent;
}
