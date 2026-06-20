import {
  classifyIntent,
  intentNeedsAnalytics,
  intentNeedsPersonalData,
  intentNeedsRag,
  intentNeedsRecommendation,
  requiresSafetyNotice,
  type AgentIntent,
} from './intent.ts';
import { mapIntentToCategories, type RetrievedDocument } from '../_shared/retrieval.ts';
import type { UserContextPayload } from './context.ts';

export interface AgentToolsPlan {
  intent: AgentIntent;
  usePersonalData: boolean;
  useRag: boolean;
  ragCategories: string[];
  useRecommendation: boolean;
  useAnalytics: boolean;
  requireSafetyNotice: boolean;
}

export function planAgentTools(
  message: string,
  hasUserId: boolean,
): AgentToolsPlan {
  const intent = classifyIntent(message);

  return {
    intent,
    usePersonalData: intentNeedsPersonalData(intent, message, hasUserId),
    useRag: intentNeedsRag(intent),
    ragCategories: mapIntentToCategories(intent, message),
    useRecommendation: intentNeedsRecommendation(intent) && hasUserId,
    useAnalytics: intentNeedsAnalytics(intent, message) && hasUserId,
    requireSafetyNotice: requiresSafetyNotice(intent),
  };
}

export function resolveUsedFlags(params: {
  knowledge: RetrievedDocument[];
  userContext: UserContextPayload;
  usePersonalData: boolean;
  responseSources: Array<{ title: string }>;
}): { usedRag: boolean; usedPersonalData: boolean } {
  const knowledgeTitles = new Set(params.knowledge.map((doc) => doc.title));
  const usedRag = params.responseSources.some((source) => knowledgeTitles.has(source.title));
  const usedPersonalData = params.usePersonalData && params.userContext.hasPersonalData;

  return { usedRag, usedPersonalData };
}
