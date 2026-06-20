/**
 * Shared n8n Code node snippets for VibeFit Email Agent.
 * Copied into workflow JSON — edit here first, then sync workflows.
 */

export const NORMALIZE_EMAIL_CODE = `
const item = $input.first().json;
const vibeFitAccount = String($env.VIBEFIT_GMAIL_ACCOUNT || '').trim().toLowerCase();

function extractEmail(raw) {
  if (!raw) return '';
  const text = String(raw);
  const match = text.match(/<([^>]+)>/);
  return (match ? match[1] : text).trim().toLowerCase();
}

function extractName(raw) {
  if (!raw) return '';
  const text = String(raw);
  const match = text.match(/^([^<]+)</);
  if (match) return match[1].trim();
  const email = extractEmail(raw);
  return email ? email.split('@')[0] : '';
}

function stripHtml(text) {
  return String(text || '').replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim();
}

const sender_email = extractEmail(item.from || item.sender || item.sender_email || '');
const sender_name = extractName(item.from || item.sender || item.sender_name || '');
const subject = String(item.subject || '').trim();
let body_text = stripHtml(item.textPlain || item.text || item.body_text || item.snippet || '');

const cutPatterns = [
  /\\nOn .+ wrote:\\s*/i,
  /\\nFrom:.+\\n/i,
  /\\nSent from my iPhone/i,
  /\\n-{2,}\\s*\\n/,
  /\\n_{2,}\\s*\\n/,
];

for (const pattern of cutPatterns) {
  const match = body_text.match(pattern);
  if (match && match.index !== undefined && match.index > 20) {
    body_text = body_text.slice(0, match.index).trim();
  }
}

body_text = body_text
  .split('\\n')
  .filter((line) => !line.trim().startsWith('>'))
  .join('\\n')
  .trim();

const dashIndex = body_text.indexOf('\\n--\\n');
if (dashIndex > 0) body_text = body_text.slice(0, dashIndex).trim();

const normalizedSubject = subject.toLowerCase();
const normalizedBody = body_text.toLowerCase();
const normalized_question = subject && body_text && !normalizedBody.includes(normalizedSubject)
  ? subject + '\\n\\n' + body_text
  : (body_text || subject);

return [{
  json: {
    sender_email,
    sender_name,
    subject,
    body_text,
    normalized_question,
    message_id: item.id || item.message_id || '',
    thread_id: item.threadId || item.thread_id || '',
    received_at: item.internalDate || item.received_at || new Date().toISOString(),
    label_ids: item.labelIds || item.label_ids || [],
    is_from_vibefit: Boolean(vibeFitAccount) && sender_email === vibeFitAccount,
    is_spam: (item.labelIds || []).includes('SPAM'),
    is_draft: (item.labelIds || []).includes('DRAFT'),
    already_processed: (item.labelIds || []).includes('vibefit-agent-processed'),
  },
}];
`.trim();

export const VALIDATE_EMAIL_CODE = `
const item = $input.first().json;
const errors = [];
const maxLength = 2000;

if (!item.message_id) errors.push('MISSING_MESSAGE_ID');
if (!item.sender_email || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(item.sender_email)) {
  errors.push('INVALID_EMAIL');
}
if (!item.normalized_question || !String(item.normalized_question).trim()) {
  errors.push('EMPTY_MESSAGE');
}
if (String(item.normalized_question || '').length > maxLength) {
  errors.push('MESSAGE_TOO_LONG');
}
if (item.is_from_vibefit) errors.push('FROM_VIBEFIT_ACCOUNT');
if (item.is_spam) errors.push('SPAM');
if (item.is_draft) errors.push('DRAFT');
if (item.already_processed) errors.push('ALREADY_LABELED');

return [{
  json: {
    ...item,
    validation_ok: errors.length === 0,
    validation_errors: errors,
  },
}];
`.trim();

export const IDENTIFY_USER_CODE = `
const item = $input.first().json;
const lookup = $input.first().json.lookup_result;

let user_id = null;
if (typeof lookup === 'string' && lookup.length > 10) user_id = lookup;
if (lookup && typeof lookup === 'object' && lookup.id) user_id = lookup.id;

return [{
  json: {
    ...item,
    user_found: Boolean(user_id),
    user_id,
  },
}];
`.trim();

export const FORMAT_REPLY_CODE = `
const agent = $input.first().json;
const email = $('Validate Message').first().json;
const identify = $('Identify User').first().json;
const userFound = typeof agent.user_found === 'boolean' ? agent.user_found : identify.user_found;
const response = agent.response || {};
const success = agent.success === true && agent.response?.answer;
const actions = Array.isArray(response.recommended_actions)
  ? response.recommended_actions
  : response.recommended_action
    ? [response.recommended_action]
    : [];

const lines = ['مرحبًا،', '', response.answer || 'تعذر إكمال الرد الآن. حاول مرة أخرى بعد قليل.'];

if (userFound && Array.isArray(response.insights) && response.insights.length > 0) {
  lines.push('', 'ملاحظات من بياناتك:');
  for (const insight of response.insights.slice(0, 3)) lines.push('- ' + insight);
}

if (actions.length > 0) {
  lines.push('', 'خطوات مقترحة:');
  actions.slice(0, 4).forEach((step, index) => lines.push((index + 1) + '. ' + step));
}

if (Array.isArray(response.sources) && response.sources.length > 0) {
  lines.push('', 'مصادر VibeFit:');
  for (const source of response.sources.slice(0, 3)) {
    lines.push('- ' + source.title + ' (' + source.category + ')');
  }
}

if (response.safety_notice) {
  lines.push('', String(response.safety_notice));
}

if (!userFound) {
  lines.push('', 'للحصول على إجابة مرتبطة بخطتك ومتابعاتك، استخدم البريد المرتبط بحسابك في VibeFit.');
}

lines.push('', 'فريق VibeFit');

const subject = email.subject || 'رسالتك';
const replySubject = /^re:/i.test(subject) ? subject : 'Re: ' + subject;

return [{
  json: {
    ...email,
    agent_success: Boolean(success),
    agent_error: success ? null : (agent.error || agent.message || 'AGENT_FAILED'),
    reply_subject: replySubject,
    reply_body: lines.join('\\n'),
    reply_to: email.sender_email,
    thread_id: email.thread_id,
    message_id: email.message_id,
    user_found: userFound,
  },
}];
`.trim();

export const HASH_SENDER_CODE = `
const crypto = require('crypto');
const item = $input.first().json;
const sender_hash = crypto.createHash('sha256').update(String(item.sender_email || '').trim().toLowerCase()).digest('hex');
return [{ json: { ...item, sender_hash } }];
`.trim();

export const WEBHOOK_NORMALIZE_CODE = `
const body = $input.first().json.body || $input.first().json;
return [{
  json: {
    from: body.sender_email,
    sender_email: body.sender_email,
    sender_name: body.sender_name || '',
    subject: body.subject || '',
    textPlain: body.body_text || '',
    body_text: body.body_text || '',
    id: body.message_id || ('test-' + Date.now()),
    threadId: body.thread_id || ('test-thread-' + Date.now()),
    labelIds: body.label_ids || [],
  },
}];
`.trim();
