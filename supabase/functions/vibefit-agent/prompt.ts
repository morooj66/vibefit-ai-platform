import type { RetrievedDocument } from '../_shared/retrieval.ts';
import type { UserContextPayload } from './context.ts';
import type { AgentIntent } from './intent.ts';
import type { AgentToolsPlan } from './orchestration.ts';
import { getLengthGuidance } from './responseFormat.ts';

export const AGENT_SYSTEM_PROMPT = `أنت مساعد VibeFit الذكي — مرافق لياقة بالعربية.

Be concise by default.
Do not repeat recommended actions in the answer.
Use short paragraphs.
Give the most useful answer first.
Avoid generic introductions.
Avoid repeating the user's question.
Do not explain obvious points.

أسلوب answer:
- جواب مباشر + تفسير مختصر من فقرة أو فقرتين فقط.
- بدون قوائم خطوات داخل answer.
- بدون Markdown: لا ### ولا ## ولا جداول ولا قوائم طويلة.
- نص عادي منظم فقط.

recommended_actions:
- المكان الوحيد للخطوات العملية.
- من 2 إلى 4 خطوات قصيرة وواضحة.
- لا تكرر أي خطوة داخل answer.

insights:
- من 1 إلى 3 نقاط فقط.
- فقط عند استخدام بيانات المستخدم أو التحليلات.
- لا تكرر نص answer.

sources:
- من 1 إلى 3 مصادر فقط من المقاطع المقدمة.
- لا تذكر المصادر داخل answer.

التخصيص:
- إذا وُجدت بيانات شخصية، اذكرها باختصار: "بناءً على آخر متابعتين…"، "معدل التزامك…".
- لا تخترع بيانات غير موجودة.

الحدود:
- لا تشخيص طبي. safety_notice فقط عند الحاجة.
- used_rag = true فقط عند استخدام مقاطع معرفة فعلًا.
- used_personal_data = true فقط عند استخدام بيانات المستخدم فعلًا.`;

function formatRecommendationBlock(recommendation: Record<string, unknown> | null): string {
  if (!recommendation) return 'لا توجد توصية/خطة محفوظة حاليًا.';

  const weeklyPlan = recommendation.weekly_plan;
  if (!weeklyPlan) return `ملخص الخطة: ${String(recommendation.summary ?? 'غير متوفر')}.`;

  return JSON.stringify(
    {
      summary: recommendation.summary ?? null,
      weekly_plan: weeklyPlan,
      status: recommendation.status ?? null,
    },
    null,
    2,
  );
}

export function buildAgentUserPrompt(params: {
  userMessage: string;
  intent: AgentIntent;
  tools: AgentToolsPlan;
  knowledgeChunks: RetrievedDocument[];
  userContext: UserContextPayload;
}): string {
  const chunks = params.knowledgeChunks.slice(0, 3);
  const knowledgeBlock =
    chunks.length > 0
      ? chunks
          .map(
            (doc, index) =>
              `[${index + 1}] ${doc.title} (${doc.category}) — ${doc.source_name}\n${doc.content}`,
          )
          .join('\n\n')
      : 'لا توجد مقاطع معرفة مسترجعة.';

  const personalSections: string[] = [];

  if (params.tools.usePersonalData && params.userContext.hasPersonalData) {
    if (params.userContext.assessment) {
      personalSections.push(
        `=== التقييم ===\n${JSON.stringify(params.userContext.assessment, null, 2)}`,
      );
    }

    if (params.tools.useRecommendation) {
      personalSections.push(
        `=== الخطة/التوصية ===\n${formatRecommendationBlock(params.userContext.recommendation)}`,
      );
    }

    if (params.tools.useAnalytics) {
      personalSections.push(
        [
          '=== تحليل المتابعات ===',
          ...params.userContext.progressSummary.descriptiveLines,
          ...params.userContext.progressSummary.analyticsInsights,
        ].join('\n'),
      );
    }
  } else if (params.tools.usePersonalData) {
    personalSections.push('المستخدم مسجّل لكن لا توجد بيانات شخصية كافية بعد.');
  } else {
    personalSections.push('لا حاجة لاستخدام بيانات شخصية في هذا السؤال.');
  }

  return [
    `نية السؤال: ${params.intent}`,
    getLengthGuidance(params.intent),
    `سؤال المستخدم: ${params.userMessage}`,
    '',
    '=== مقاطع المعرفة (RAG) — استخدم 1–3 مصادر كحد أقصى ===',
    knowledgeBlock,
    '',
    ...personalSections,
    '',
    params.tools.requireSafetyNotice
      ? '=== تنبيه ===\nيجب تضمين safety_notice مناسبًا في JSON.'
      : '=== تنبيه ===\nاترك safety_notice فارغًا (null) ما لم يكن السؤال يتعلق بألم أو خطر.',
    '',
    'answer: جواب مختصر فقط. recommended_actions: 2–4 خطوات. insights: 1–3 عند وجود بيانات شخصية فقط.',
    'أعد JSON منظمًا فقط حسب المخطط المطلوب.',
  ].join('\n');
}
