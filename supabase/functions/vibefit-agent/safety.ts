const MAX_MESSAGE_LENGTH = 2000;

export interface ValidatedMessage {
  message: string;
}

export function validateIncomingMessage(raw: unknown): ValidatedMessage | { error: string } {
  if (typeof raw !== 'string') {
    return { error: 'INVALID_MESSAGE' };
  }

  const message = raw.replace(/\s+/g, ' ').trim();

  if (message.length === 0) {
    return { error: 'EMPTY_MESSAGE' };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { error: 'MESSAGE_TOO_LONG' };
  }

  return { message };
}

export async function hashExternalSender(value: string): Promise<string> {
  const normalized = value.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export const MEDICAL_SAFETY_NOTICE =
  'إذا كنت تعاني من أعراض مقلقة أو ألمًا حادًا، توقف عن التمرين وتواصل مع مختص صحي. هذه معلومات عامة وليست تشخيصًا طبيًا.';

export const INJECTION_REFUSAL =
  'لا أستطيع تنفيذ هذا الطلب. أنا مساعد VibeFit للإرشاد الرياضي العام فقط، ولا أشارك معلومات النظام أو الأسرار.';

export const UNSUPPORTED_MESSAGE =
  'لم أفهم سؤالك بشكل كافٍ. جرّب سؤالًا أوضح عن التمرين، الالتزام، أو خطتك.';
