#!/usr/bin/env node
/**
 * VibeFit Proactive Agent — local validation
 * Run: npm run validate:proactive
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function pass(name, detail = '') {
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}

function read(rel) {
  const full = join(root, rel);
  return existsSync(full) ? readFileSync(full, 'utf8') : null;
}

const migration = read('supabase/migrations/008_create_proactive_email_events.sql');
if (!migration) {
  fail('Migration 008 exists');
} else {
  pass('Migration 008 exists');
  const checks = [
    ['proactive_email_events table', /create table if not exists public\.proactive_email_events/i],
    ['email_preferences table', /create table if not exists public\.email_preferences/i],
    ['enqueue_proactive_email_event', /enqueue_proactive_email_event/i],
    ['fetch_pending_proactive_events', /fetch_pending_proactive_events/i],
    ['update_proactive_event_status', /update_proactive_event_status/i],
    ['run_proactive_lifecycle_detection', /run_proactive_lifecycle_detection/i],
    ['deduplication_key unique', /deduplication_key text not null[\s\S]*unique \(deduplication_key\)/i],
    ['welcome trigger', /trigger_proactive_welcome_email/i],
    ['assessment trigger', /trigger_proactive_assessment_completed/i],
    ['recommendation trigger', /trigger_proactive_recommendation_ready/i],
    ['no drop table', /\bdrop table\b/i],
  ];
  for (const [label, pattern] of checks) {
    if (label === 'no drop table') {
      if (pattern.test(migration)) fail(label);
      else pass(label);
    } else if (pattern.test(migration)) pass(label);
    else fail(label);
  }
}

const fnIndex = read('supabase/functions/vibefit-proactive-agent/index.ts');
if (!fnIndex) fail('vibefit-proactive-agent/index.ts');
else {
  pass('Edge Function index.ts');
  [
    ['PROACTIVE_AGENT_SECRET', /PROACTIVE_AGENT_SECRET/],
    ['server-only user_id', /isUuid\(userId\)/],
    ['should_send output', /should_send/],
    ['guardrails', /evaluateSendGuardrails/],
    ['RAG fallback', /retrieveKnowledgeForIntent/],
    ['no stack trace to user', /message: 'Webhook غير مصرح'/],
  ].forEach(([label, pattern]) => {
    if (pattern.test(fnIndex)) pass(`Function: ${label}`);
    else fail(`Function: ${label}`);
  });
}

for (const file of [
  'supabase/functions/vibefit-proactive-agent/schema.ts',
  'supabase/functions/vibefit-proactive-agent/events.ts',
  'supabase/functions/vibefit-proactive-agent/guardrails.ts',
  'supabase/functions/vibefit-proactive-agent/prompt.ts',
  'supabase/functions/vibefit-proactive-agent/format.ts',
]) {
  if (existsSync(join(root, file))) pass('Function file', file);
  else fail('Function file missing', file);
}

for (const wf of [
  'n8n/vibefit-proactive-email-agent.workflow.json',
  'n8n/vibefit-weekly-summary.workflow.json',
]) {
  const content = read(wf);
  if (!content) {
    fail('Workflow missing', wf);
    continue;
  }
  try {
    JSON.parse(content);
    pass('Valid JSON', wf);
  } catch {
    fail('Invalid JSON', wf);
  }
}

const proactiveWf = read('n8n/vibefit-proactive-email-agent.workflow.json') ?? '';
[
  ['Schedule Trigger', /scheduleTrigger/i],
  ['Fetch Pending Events', /fetch_pending_proactive_events/i],
  ['Call Proactive Agent', /Call Proactive Agent/],
  ['Gmail Send', /Gmail Send/],
  ['Mark Sent', /Mark Sent/],
  ['no hardcoded secrets', /sk-[a-zA-Z0-9]{10,}/i],
].forEach(([label, pattern]) => {
  if (label === 'no hardcoded secrets') {
    if (pattern.test(proactiveWf)) fail(label);
    else pass(label);
  } else if (pattern.test(proactiveWf)) pass(`Workflow: ${label}`);
  else fail(`Workflow: ${label}`);
});

const docs = ['docs/PROACTIVE_EMAIL_AGENT.md', 'docs/COLAB_AGENT_DEMO.md'];
for (const doc of docs) {
  if (existsSync(join(root, doc))) pass('Doc exists', doc);
  else fail('Doc missing', doc);
}

if (existsSync(join(root, 'notebooks/VibeFit_AI_Agent_RAG_Colab.ipynb'))) {
  pass('Colab notebook exists');
} else {
  fail('Colab notebook missing');
}

console.log('');
if (failed > 0) {
  console.log(`${failed} check(s) failed`);
  process.exit(1);
}
console.log('All proactive agent local checks passed.');
