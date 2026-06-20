import { z } from 'npm:zod@3.23.8';

export const proactiveEmailSchema = z.object({
  should_send: z.boolean(),
  event_type: z.string(),
  subject: z.string().optional(),
  greeting: z.string().optional(),
  body: z.string().optional(),
  recommended_actions: z.array(z.string()).default([]),
  cta_text: z.string().optional(),
  cta_url: z.string().optional(),
  footer_notice: z.string().nullable().optional(),
  used_personal_data: z.boolean().default(false),
  used_rag: z.boolean().default(false),
  reason_not_sent: z.string().nullable().optional(),
});

export type ProactiveEmailOutput = z.infer<typeof proactiveEmailSchema>;

export const openAiProactiveJsonSchema = {
  name: 'vibefit_proactive_email',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'should_send',
      'event_type',
      'subject',
      'greeting',
      'body',
      'recommended_actions',
      'cta_text',
      'cta_url',
      'footer_notice',
      'used_personal_data',
      'used_rag',
      'reason_not_sent',
    ],
    properties: {
      should_send: { type: 'boolean' },
      event_type: { type: 'string' },
      subject: { type: 'string' },
      greeting: { type: 'string' },
      body: { type: 'string' },
      recommended_actions: {
        type: 'array',
        items: { type: 'string' },
      },
      cta_text: { type: 'string' },
      cta_url: { type: 'string' },
      footer_notice: { type: ['string', 'null'] },
      used_personal_data: { type: 'boolean' },
      used_rag: { type: 'boolean' },
      reason_not_sent: { type: ['string', 'null'] },
    },
  },
};

export function buildSkipResponse(
  eventType: string,
  reason: string,
): ProactiveEmailOutput {
  return {
    should_send: false,
    event_type: eventType,
    recommended_actions: [],
    used_personal_data: false,
    used_rag: false,
    reason_not_sent: reason,
  };
}

export function buildFallbackEmail(params: {
  eventType: string;
  subject: string;
  greeting: string;
  body: string;
  actions: string[];
  ctaText: string;
  ctaUrl: string;
  usedPersonalData: boolean;
  usedRag: boolean;
}): ProactiveEmailOutput {
  return {
    should_send: true,
    event_type: params.eventType,
    subject: params.subject,
    greeting: params.greeting,
    body: params.body,
    recommended_actions: params.actions,
    cta_text: params.ctaText,
    cta_url: params.ctaUrl,
    footer_notice: 'هذه توصيات عامة وليست تشخيصًا طبيًا.',
    used_personal_data: params.usedPersonalData,
    used_rag: params.usedRag,
    reason_not_sent: null,
  };
}
