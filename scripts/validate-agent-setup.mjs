#!/usr/bin/env node
/**
 * VibeFit Agent — فحص محلي بدون اتصال Supabase أو Authentication
 * تشغيل: npm run validate:agent
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const checks = [];
let failed = 0;

function pass(name, detail = '') {
  checks.push({ ok: true, name, detail });
}

function fail(name, detail) {
  checks.push({ ok: false, name, detail });
  failed += 1;
}

function read(relPath) {
  const full = join(root, relPath);
  if (!existsSync(full)) return null;
  return readFileSync(full, 'utf8');
}

function requireFile(relPath, label) {
  if (existsSync(join(root, relPath))) {
    pass(label, relPath);
    return true;
  }
  fail(label, `missing: ${relPath}`);
  return false;
}

// 1. Migration 006
const migrationPath = 'supabase/migrations/006_create_knowledge_and_agent.sql';
const migration = read(migrationPath);
if (migration) {
  pass('Migration 006 exists', migrationPath);

  const migrationChecks = [
    ['knowledge_documents table', /create table if not exists public\.knowledge_documents/i],
    ['agent_conversations table', /create table if not exists public\.agent_conversations/i],
    ['agent_messages table', /create table if not exists public\.agent_messages/i],
    ['agent_runs table', /create table if not exists public\.agent_runs/i],
    ['search_knowledge_documents RPC', /create or replace function public\.search_knowledge_documents/i],
    ['is_active filter', /is_active\s*=\s*true/i],
    ['safe policy recreation', /drop policy if exists/i],
    ['no drop table', /\bdrop table\b/i],
  ];

  for (const [label, pattern] of migrationChecks) {
    if (label === 'no drop table') {
      if (pattern.test(migration)) fail(label, 'found DROP TABLE in migration 006');
      else pass(label);
    } else if (pattern.test(migration)) {
      pass(`Migration: ${label}`);
    } else {
      fail(`Migration: ${label}`, 'pattern not found');
    }
  }
} else {
  fail('Migration 006 exists', `missing: ${migrationPath}`);
}

// 2. Seed
const seedPath = 'supabase/seed/knowledge-base.sql';
const seed = read(seedPath);
if (seed) {
  pass('Seed file exists', seedPath);

  const insertRows = (seed.match(/^\s*\(/gm) ?? []).length;
  if (insertRows >= 20) {
    pass('Seed knowledge chunks', `${insertRows} rows`);
  } else {
    fail('Seed knowledge chunks', `expected 20+, found ${insertRows}`);
  }

  if (/on conflict\s*\(\s*title\s*,\s*category\s*\)\s*do nothing/i.test(seed)) {
    pass('Seed idempotent (ON CONFLICT)');
  } else {
    fail('Seed idempotent', 'missing ON CONFLICT (title, category) DO NOTHING');
  }
} else {
  fail('Seed file exists', `missing: ${seedPath}`);
}

// 3. Edge Function folder + files
const functionFiles = [
  'supabase/functions/vibefit-agent/index.ts',
  'supabase/functions/vibefit-agent/schema.ts',
  'supabase/functions/vibefit-agent/prompt.ts',
  'supabase/functions/_shared/retrieval.ts',
  'supabase/functions/_shared/cors.ts',
];

for (const file of functionFiles) {
  requireFile(file, `Function file: ${file.split('/').pop()}`);
}

const indexTs = read('supabase/functions/vibefit-agent/index.ts');
const schemaTs = read('supabase/functions/vibefit-agent/schema.ts');
const responseSource = [indexTs, schemaTs].filter(Boolean).join('\n');
if (responseSource) {
  const responseKeys = [
    'answer',
    'intent',
    'sources',
    'insights',
    'recommended_actions',
    'safety_notice',
    'used_personal_data',
    'used_rag',
  ];
  const missingKeys = responseKeys.filter((key) => !responseSource.includes(key));
  if (missingKeys.length === 0) pass('Structured response keys');
  else fail('Structured response keys', `missing: ${missingKeys.join(', ')}`);
}

if (indexTs) {
  if (/auth\.getUser\(\)/.test(indexTs)) pass('Web JWT via getUser()');
  else fail('Web JWT via getUser()', 'not found');

  if (/AGENT_WEBHOOK_SECRET/.test(indexTs)) pass('External webhook secret check');
  else fail('External webhook secret check', 'not found');
}

const retrievalTs = read('supabase/functions/_shared/retrieval.ts');
if (retrievalTs) {
  if (/search_knowledge_documents/.test(retrievalTs)) pass('Retrieval calls search_knowledge_documents RPC');
  else fail('Retrieval RPC call', 'search_knowledge_documents not found');

  const positiveVectorClaims = /pgvector|using\s+vector\s+search|vector\s+embeddings?/i.test(
    retrievalTs.replace(/ليس\s+Vector\s+Search/gi, ''),
  );
  if (!positiveVectorClaims) pass('Retrieval uses full-text (not vector)');
  else fail('Retrieval type', 'claims vector search');
}

// 4. Frontend service
const agentService = read('src/services/agent/agentService.ts');
if (agentService) {
  if (/FunctionsHttpError/.test(agentService) && /import\.meta\.env\.DEV/.test(agentService)) {
    pass('Frontend DEV error logging');
  } else {
    fail('Frontend DEV error logging', 'FunctionsHttpError or DEV guard missing');
  }
} else {
  fail('agentService.ts', 'missing src/services/agent/agentService.ts');
}

// 5. RPC name in migration matches retrieval
if (migration && retrievalTs) {
  if (migration.includes('search_knowledge_documents') && retrievalTs.includes('search_knowledge_documents')) {
    pass('RPC name consistency');
  } else {
    fail('RPC name consistency', 'search_knowledge_documents mismatch');
  }
}

// 6. Secrets scan (explicit patterns only — not env var names)
const secretPatterns = [
  /sk-[a-zA-Z0-9]{20,}/,
  /OPENAI_API_KEY\s*=\s*['"][^'"]+['"]/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"][^'"]+['"]/,
  /eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
];

const scannedPaths = [
  ...functionFiles,
  'src/services/agent/agentService.ts',
  'src/pages/AssistantPage.tsx',
  seedPath,
  migrationPath,
].filter((p) => read(p));

let secretsFound = false;
for (const relPath of scannedPaths) {
  const content = read(relPath);
  if (!content) continue;
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      secretsFound = true;
      fail('No hardcoded secrets', `possible secret in ${relPath}`);
      break;
    }
  }
}
if (!secretsFound) pass('No hardcoded secrets in scanned files');

// 7. JSON validity
const jsonFiles = [
  'n8n/vibefit-agent-demo.workflow.json',
  'package.json',
  'tsconfig.json',
];
for (const file of jsonFiles) {
  const content = read(file);
  if (!content) continue;
  try {
    JSON.parse(content);
    pass(`Valid JSON: ${file}`);
  } catch (error) {
    fail(`Valid JSON: ${file}`, error instanceof Error ? error.message : 'parse error');
  }
}

// 8. TypeScript imports (basic syntax check)
const tsFiles = [
  'src/types/agent.ts',
  'src/pages/AssistantPage.tsx',
  'src/services/agent/agentService.ts',
];
for (const file of tsFiles) {
  const content = read(file);
  if (!content) continue;
  if (/^import\s/m.test(content) || /^export\s/m.test(content)) {
    pass(`TS imports/exports: ${file.split('/').pop()}`);
  } else {
    fail(`TS imports/exports: ${file}`, 'no import/export found');
  }
}

// Report
console.log('\nVibeFit Agent Setup Validation\n');
for (const check of checks) {
  const icon = check.ok ? '✓' : '✗';
  const detail = check.detail ? ` — ${check.detail}` : '';
  console.log(`${icon} ${check.name}${detail}`);
}

console.log(`\n${checks.length - failed} passed, ${failed} failed\n`);

if (failed > 0) {
  process.exit(1);
}

console.log('All local agent setup checks passed.');
console.log('Next: run migration 006 + seed in Supabase SQL Editor, then deploy vibefit-agent.');
