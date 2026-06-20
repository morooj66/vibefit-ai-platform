#!/usr/bin/env node
/**
 * Validates n8n email agent workflows locally (no n8n/Gmail connection).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  failed += 1;
}

function readJson(relPath) {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  return JSON.parse(readFileSync(full, 'utf8'));
}

const secretPatterns = [
  /sk-[a-zA-Z0-9]{20,}/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
  /sbp_[a-z0-9]{20,}/i,
];

function scanSecrets(content, label) {
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      fail(`${label}: possible secret found`);
      return;
    }
  }
  pass(`${label}: no hardcoded secrets`);
}

const migration = readFileSync(join(root, 'supabase/migrations/007_create_email_agent_events.sql'), 'utf8');
if (/email_agent_events/.test(migration) && /register_email_agent_event/.test(migration)) {
  pass('Migration 007 defines email_agent_events + RPCs');
} else {
  fail('Migration 007 incomplete');
}

const main = readJson('n8n/vibefit-email-agent.workflow.json');
const test = readJson('n8n/vibefit-email-agent-test.workflow.json');

for (const [label, wf] of [
  ['Main workflow', main],
  ['Test workflow', test],
]) {
  if (!wf) {
    fail(`${label} missing`);
    continue;
  }

  const names = new Set(wf.nodes.map((node) => node.name));
  const required = [
    'Normalize Email',
    'Validate Message',
    'Call VibeFit Agent',
    'Format Reply',
    'Check Duplicate',
    'Lookup User',
  ];

  for (const name of required) {
    if (names.has(name)) pass(`${label}: node ${name}`);
    else fail(`${label}: missing node ${name}`);
  }

  const agentNode = wf.nodes.find((node) => node.name === 'Call VibeFit Agent');
  if (agentNode?.parameters?.jsonBody?.includes('channel: "email"')) {
    pass(`${label}: calls vibefit-agent with email channel`);
  } else {
    fail(`${label}: agent body missing email channel`);
  }

  if (agentNode?.parameters?.headerParameters?.parameters?.some((h) => h.name === 'x-vibefit-agent-secret')) {
    pass(`${label}: uses webhook secret header`);
  } else {
    fail(`${label}: missing webhook secret header`);
  }

  scanSecrets(JSON.stringify(wf), label);
}

if (main?.nodes?.some((node) => node.type === 'n8n-nodes-base.gmailTrigger')) {
  pass('Main workflow: Gmail Trigger present');
} else {
  fail('Main workflow: Gmail Trigger missing');
}

if (main?.nodes?.some((node) => node.name === 'Gmail Reply')) {
  pass('Main workflow: Gmail Reply present');
} else {
  fail('Main workflow: Gmail Reply missing');
}

if (test?.nodes?.some((node) => node.type === 'n8n-nodes-base.webhook')) {
  pass('Test workflow: Webhook present');
} else {
  fail('Test workflow: Webhook missing');
}

const indexTs = readFileSync(join(root, 'supabase/functions/vibefit-agent/index.ts'), 'utf8');
if (/user_found/.test(indexTs) && /external_thread_id/.test(indexTs)) {
  pass('vibefit-agent supports email user_found + thread continuity');
} else {
  fail('vibefit-agent email enhancements missing');
}

console.log(`\n${failed === 0 ? 'All n8n email agent checks passed.' : `${failed} check(s) failed.`}`);
if (failed > 0) process.exit(1);
