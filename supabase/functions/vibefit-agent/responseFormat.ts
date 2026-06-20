import type { AgentIntent } from './intent.ts';
import type { AgentResponse } from './schema.ts';

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|.+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function getMaxWordsForIntent(intent: AgentIntent): number {
  switch (intent) {
    case 'progress_analysis':
    case 'recovery_and_fatigue':
      return 250;
    case 'plan_question':
    case 'motivation_and_adherence':
      return 180;
    case 'open_question':
      return 200;
    default:
      return 120;
  }
}

export function getLengthGuidance(intent: AgentIntent): string {
  switch (intent) {
    case 'progress_analysis':
    case 'recovery_and_fatigue':
      return 'الطول المستهدف: 150–250 كلمة كحد أقصى.';
    case 'plan_question':
    case 'motivation_and_adherence':
      return 'الطول المستهدف: 100–180 كلمة.';
    default:
      return 'الطول المستهدف: 60–120 كلمة.';
  }
}

export function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(' ')}…`;
}

function normalizeForCompare(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDuplicateOfAnswer(action: string, answer: string): boolean {
  const normalizedAction = normalizeForCompare(action);
  const normalizedAnswer = normalizeForCompare(answer);
  if (normalizedAction.length < 8) return false;
  if (normalizedAnswer.includes(normalizedAction)) return true;

  const actionWords = normalizedAction.split(' ').filter((word) => word.length >= 4);
  if (actionWords.length === 0) return false;

  const matched = actionWords.filter((word) => normalizedAnswer.includes(word)).length;
  return matched / actionWords.length >= 0.7;
}

export function formatAgentResponse(
  response: AgentResponse,
  intent: AgentIntent,
  usedPersonalData: boolean,
): AgentResponse {
  const maxWords = getMaxWordsForIntent(intent);
  let answer = stripMarkdown(response.answer);
  answer = trimToWordLimit(answer, maxWords);

  let recommended_actions = response.recommended_actions
    .map((action) => stripMarkdown(action).trim())
    .filter(Boolean)
    .slice(0, 4);

  recommended_actions = recommended_actions.filter(
    (action) => !isDuplicateOfAnswer(action, answer),
  );

  let insights = usedPersonalData
    ? response.insights.map((item) => stripMarkdown(item).trim()).filter(Boolean).slice(0, 3)
    : [];

  insights = insights.filter((insight) => {
    const normalizedInsight = normalizeForCompare(insight);
    const normalizedAnswer = normalizeForCompare(answer);
    return normalizedInsight.length > 0 && !normalizedAnswer.includes(normalizedInsight);
  });

  const sources = response.sources.slice(0, 3);

  return {
    ...response,
    answer,
    recommended_actions,
    insights,
    sources,
    safety_notice: response.safety_notice
      ? stripMarkdown(response.safety_notice)
      : response.safety_notice,
  };
}
