#!/usr/bin/env node
/**
 * Logical tests for n8n email agent helpers (no external services).
 */

import {
  FORMAT_REPLY_CODE,
  NORMALIZE_EMAIL_CODE,
  VALIDATE_EMAIL_CODE,
} from '../n8n/lib/emailAgentCode.js';

let failed = 0;

function ok(name, condition) {
  if (condition) console.log(`✓ ${name}`);
  else {
    console.error(`✗ ${name}`);
    failed += 1;
  }
}

function runCode(code, input) {
  const $input = {
    first: () => ({ json: input }),
  };
  const $env = { VIBEFIT_GMAIL_ACCOUNT: 'coach@vibefit.example' };
  const $ = (name) => ({
    first: () => ({
      json:
        name === 'Validate Message'
          ? input.validated || input
          : name === 'Identify User'
            ? input.identify || input
            : input,
    }),
  });
  // eslint-disable-next-line no-new-func
  const fn = new Function('$input', '$env', '$', code);
  return fn($input, $env, $)[0].json;
}

const normalized = runCode(NORMALIZE_EMAIL_CODE, {
  from: 'User <user@example.com>',
  subject: 'سؤال عن الخطة',
  textPlain: 'كيف أعود للخطة؟\n\nOn Mon wrote:\nold',
  id: 'msg-1',
  threadId: 'thread-1',
});

ok('Normalize extracts sender_email', normalized.sender_email === 'user@example.com');
ok('Normalize builds question', normalized.normalized_question.includes('كيف أعود'));

const validated = runCode(VALIDATE_EMAIL_CODE, normalized);
ok('Valid message passes', validated.validation_ok === true);

const spam = runCode(VALIDATE_EMAIL_CODE, { ...normalized, is_spam: true });
ok('Spam rejected', spam.validation_ok === false);

const self = runCode(VALIDATE_EMAIL_CODE, { ...normalized, is_from_vibefit: true });
ok('Self-mail rejected', self.validation_ok === false);

const formatted = runCode(FORMAT_REPLY_CODE, {
  success: true,
  response: {
    answer: 'ابدئي بالعودة تدريجيًا.',
    recommended_actions: ['ابدئي بجلستين', 'استخدمي 60–70%'],
    sources: [{ title: 'العودة بعد انقطاع', category: 'الالتزام', source_name: 'VibeFit Knowledge Base' }],
    insights: ['معدل التزامك 70%'],
  },
  validated,
  identify: { user_found: true },
});

ok('Format includes answer', formatted.reply_body.includes('ابدئي بالعودة'));
ok('Format includes steps', formatted.reply_body.includes('1. ابدئي بجلستين'));
ok('Format excludes intent', !formatted.reply_body.includes('intent'));
ok('Format excludes used_rag', !formatted.reply_body.includes('used_rag'));

const guest = runCode(FORMAT_REPLY_CODE, {
  success: true,
  response: { answer: 'إجابة عامة.', recommended_actions: [], sources: [], insights: [] },
  validated,
  identify: { user_found: false },
});

ok('Guest footer added', guest.reply_body.includes('البريد المرتبط بحسابك'));

console.log(`\n${failed === 0 ? 'All n8n email logic tests passed.' : `${failed} failed.`}`);
if (failed > 0) process.exit(1);
