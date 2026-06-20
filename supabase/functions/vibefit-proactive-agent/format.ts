const FORBIDDEN_PHRASES = [
  'فشل',
  'أهمل',
  'لازم تعوض',
  'لازم تضغط',
  'sk-',
  'gpt-',
  'openai',
  'claude',
];

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(' ');
  return words.slice(0, maxWords).join(' ') + '…';
}

export function sanitizeEmailText(text: string): string {
  let cleaned = stripMarkdown(text);
  for (const phrase of FORBIDDEN_PHRASES) {
    const regex = new RegExp(phrase, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

export function dedupeActions(actions: string[], max = 4): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const action of actions) {
    const normalized = sanitizeEmailText(action);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= max) break;
  }
  return result;
}

export function formatProactiveEmail(params: {
  greeting: string;
  body: string;
  recommended_actions: string[];
  cta_text: string;
  cta_url: string;
  footer_notice?: string | null;
}): string {
  const lines = [
    sanitizeEmailText(params.greeting),
    '',
    sanitizeEmailText(params.body),
  ];

  if (params.recommended_actions.length > 0) {
    lines.push('', 'خطوات مقترحة:');
    params.recommended_actions.slice(0, 4).forEach((step, index) => {
      lines.push(`${index + 1}. ${sanitizeEmailText(step)}`);
    });
  }

  lines.push('', `${params.cta_text}: ${params.cta_url}`);

  if (params.footer_notice) {
    lines.push('', sanitizeEmailText(params.footer_notice));
  }

  lines.push('', 'فريق VibeFit');
  return lines.join('\n');
}
