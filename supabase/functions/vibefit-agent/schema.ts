import { z } from 'npm:zod@3.23.8';

export const agentSourceSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  source_name: z.string().min(1),
});

export const agentResponseSchema = z.object({
  answer: z.string().min(1),
  intent: z.string().min(1),
  sources: z.array(agentSourceSchema).default([]),
  insights: z.array(z.string()).default([]),
  recommended_actions: z.array(z.string()).default([]),
  safety_notice: z.string().nullable().optional(),
  used_personal_data: z.boolean(),
  used_rag: z.boolean(),
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

export const openAiAgentJsonSchema = {
  name: 'vibefit_agent_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'answer',
      'intent',
      'sources',
      'insights',
      'recommended_actions',
      'safety_notice',
      'used_personal_data',
      'used_rag',
    ],
    properties: {
      answer: { type: 'string' },
      intent: { type: 'string' },
      sources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'category', 'source_name'],
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            source_name: { type: 'string' },
          },
        },
      },
      insights: {
        type: 'array',
        items: { type: 'string' },
      },
      recommended_actions: {
        type: 'array',
        items: { type: 'string' },
      },
      safety_notice: { type: ['string', 'null'] },
      used_personal_data: { type: 'boolean' },
      used_rag: { type: 'boolean' },
    },
  },
};

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value.trim()];
  }
  return [];
}

export function normalizeLegacyResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;

  const record = raw as Record<string, unknown>;
  const recommendedActions = coerceStringArray(record.recommended_actions);

  if (recommendedActions.length === 0 && typeof record.recommended_action === 'string') {
    record.recommended_actions = [record.recommended_action];
  } else {
    record.recommended_actions = recommendedActions;
  }

  if (record.safety_notice === null) {
    record.safety_notice = undefined;
  }

  return record;
}

export function extractRawAnswer(content: string): string {
  const trimmed = content.trim();

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.answer === 'string' && parsed.answer.trim()) {
      return parsed.answer.trim();
    }
  } catch {
    // not JSON — use raw text
  }

  const answerMatch = trimmed.match(/"answer"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (answerMatch?.[1]) {
    return answerMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim();
  }

  return trimmed;
}

export function buildResponseFromRawText(params: {
  content: string;
  intent: string;
  knowledgeTitles: Set<string>;
  sources: Array<{ title: string; category: string; source_name: string }>;
  usedPersonalData: boolean;
  usedRag: boolean;
  safetyNotice?: string | null;
}): AgentResponse {
  const answer = extractRawAnswer(params.content);

  const filteredSources = params.sources.filter((source) => params.knowledgeTitles.has(source.title));

  return {
    answer: answer || 'تعذر صياغة إجابة واضحة الآن. حاول إعادة صياغة سؤالك.',
    intent: params.intent,
    sources: params.usedRag ? filteredSources : [],
    insights: [],
    recommended_actions: [],
    safety_notice: params.safetyNotice ?? undefined,
    used_personal_data: params.usedPersonalData,
    used_rag: params.usedRag && filteredSources.length > 0,
  };
}

export function buildSafeFallbackResponse(
  intent: string,
  message: string,
  safetyNotice?: string,
  recommendedActions: string[] = ['إذا استمرت المشكلة، أعد المحاولة لاحقًا أو تواصل مع مختص.'],
): AgentResponse {
  return {
    answer: message,
    intent,
    sources: [],
    insights: [],
    recommended_actions: recommendedActions,
    safety_notice: safetyNotice,
    used_personal_data: false,
    used_rag: false,
  };
}
