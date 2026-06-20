import type { ProactiveEventType } from './events.ts';
import type { UserContextPayload } from '../vibefit-agent/context.ts';

const MEDICAL_FOOTER = 'هذه توصيات عامة وليست تشخيصًا طبيًا.';

export const PROACTIVE_SYSTEM_PROMPT = `أنت VibeFit Proactive Email Agent.
اكتب رسائل بريد عربية قصيرة، ودية، غير حكمية، عملية، ومخصصة.
قواعد صارمة:
- لا Markdown (لا ### ولا **).
- لا لغة لوم أو ضغط (مثل: فشل، أهمل، لازم تعوض).
- لا تشخيص طبي ولا وعود بنتائج صحية.
- لا ذكر OpenAI أو أي model.
- لا أرقام كثيرة — لخّص ببساطة.
- الاستمرارية أهم من الكمال.
- body بين 70 و180 كلمة حسب نوع الرسالة.
- recommended_actions: 2 إلى 4 خطوات فقط.
- greeting باسم المستخدم إن وُجد display_name.
- footer_notice: "${MEDICAL_FOOTER}" عند الحاجة.
- used_personal_data و used_rag حسب ما استخدمت فعليًا.
- إذا لا يجب الإرسال: should_send=false مع reason_not_sent.`;

export function buildProactiveUserPrompt(params: {
  eventType: ProactiveEventType;
  eventMetadata: Record<string, unknown>;
  userContext: UserContextPayload;
  knowledgeSnippets: string[];
  ctaUrl: string;
  ctaText: string;
  defaultSubject: string;
}): string {
  const name = (params.userContext.profile?.display_name as string | undefined)?.trim() || 'صديق VibeFit';
  const assessment = params.userContext.assessment;
  const recommendation = params.userContext.recommendation;
  const progress = params.userContext.progressSummary;

  const lines = [
    `نوع الحدث: ${params.eventType}`,
    `الاسم: ${name}`,
    `الموضوع المقترح: ${params.defaultSubject}`,
    `CTA: ${params.ctaText} → ${params.ctaUrl}`,
    '',
    '--- سياق المستخدم ---',
  ];

  if (assessment) {
    lines.push(
      `الهدف: ${String(assessment.primary_goal ?? 'غير محدد')}`,
      `المستوى: ${String(assessment.experience_level ?? 'غير محدد')}`,
      `أيام التدريب: ${String(assessment.training_days_per_week ?? '?')}`,
      `مدة الجلسة: ${String(assessment.session_duration_minutes ?? '?')} دقيقة`,
    );
  }

  if (recommendation && params.eventType !== 'user_signed_up') {
    lines.push(`ملخص التوصية: ${String(recommendation.summary ?? '').slice(0, 280)}`);
  }

  if (progress.weeksCount > 0) {
    lines.push('--- تحليل المتابعات ---');
    progress.descriptiveLines.forEach((line) => lines.push(line));
    progress.analyticsInsights.forEach((line) => lines.push(line));
  }

  if (params.knowledgeSnippets.length > 0) {
    lines.push('', '--- مقاطع معرفة (RAG) ---');
    params.knowledgeSnippets.forEach((snippet, index) => {
      lines.push(`${index + 1}. ${snippet.slice(0, 220)}`);
    });
  }

  if (Object.keys(params.eventMetadata).length > 0) {
    lines.push('', '--- metadata ---', JSON.stringify(params.eventMetadata));
  }

  lines.push(
    '',
    'اكتب JSON منظمًا فقط حسب المخطط.',
    'should_send=true إلا إذا البيانات غير كافية تمامًا.',
  );

  return lines.join('\n');
}
