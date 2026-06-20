#!/usr/bin/env node
/**
 * Live HTTP test for vibefit-agent email channel.
 * Requires: VIBEFIT_AGENT_URL, VIBEFIT_AGENT_SECRET, TEST_EMAIL
 * Run: npm run test:live-agent-email
 */

const url = process.env.VIBEFIT_AGENT_URL;
const secret = process.env.VIBEFIT_AGENT_SECRET;
const testEmail = process.env.TEST_EMAIL;

function missing(name) {
  return !process.env[name] || String(process.env[name]).trim().length === 0;
}

if (missing('VIBEFIT_AGENT_URL') || missing('VIBEFIT_AGENT_SECRET') || missing('TEST_EMAIL')) {
  console.log('Skipped: set VIBEFIT_AGENT_URL, VIBEFIT_AGENT_SECRET, and TEST_EMAIL to run live test.');
  process.exit(0);
}

const body = {
  message: 'كيف أعود للخطة بعد أسبوع غير منتظم؟',
  channel: 'email',
  external_sender: testEmail.trim(),
  conversation_id: 'cursor-live-test',
};

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-vibefit-agent-secret': secret,
  },
  body: JSON.stringify(body),
});

const text = await response.text();
let payload;
try {
  payload = JSON.parse(text);
} catch {
  console.error('Failed to parse JSON response');
  process.exit(1);
}

const secretPattern = /sk-[a-zA-Z0-9]{20,}|sbp_[a-z0-9]{20,}/i;
if (secretPattern.test(text)) {
  console.error('Response may contain secrets — aborting');
  process.exit(1);
}

console.log('HTTP status:', response.status);

if (response.status !== 200) {
  console.error('Expected HTTP 200, got', response.status);
  console.error('Error code:', payload.error || 'UNKNOWN');
  process.exit(1);
}

if (payload.success !== true) {
  console.error('success !== true', payload.error || '');
  process.exit(1);
}

if (!payload.response?.answer?.trim()) {
  console.error('Empty answer');
  process.exit(1);
}

if (!Array.isArray(payload.response.recommended_actions)) {
  console.error('recommended_actions is not an array');
  process.exit(1);
}

if (typeof payload.user_found !== 'boolean') {
  console.error('user_found missing or invalid');
  process.exit(1);
}

console.log('Live agent email test passed.');
console.log('user_found:', payload.user_found);
console.log('used_rag:', payload.response.used_rag);
console.log('used_personal_data:', payload.response.used_personal_data);
console.log('answer preview:', payload.response.answer.slice(0, 120) + '…');
