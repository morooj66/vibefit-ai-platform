#!/usr/bin/env node
/**
 * Builds supabase/manual/agent-email-setup.sql from migrations + seed.
 * Run: node scripts/generate-agent-email-setup-sql.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'supabase/manual');
const outPath = join(outDir, 'agent-email-setup.sql');

const sections = [
  {
    title: 'Migration 006 — Knowledge + Agent tables + RAG RPC',
    path: 'supabase/migrations/006_create_knowledge_and_agent.sql',
  },
  {
    title: 'Migration 007 — Email agent events + idempotency RPCs',
    path: 'supabase/migrations/007_create_email_agent_events.sql',
  },
  {
    title: 'Seed — Knowledge base (27 chunks, idempotent)',
    path: 'supabase/seed/knowledge-base.sql',
  },
];

mkdirSync(outDir, { recursive: true });

const parts = [
  '-- VibeFit Agent + Email AI Agent — Manual setup (single file)',
  '-- Run in Supabase SQL Editor — safe to re-run',
  '-- Order: 006 → 007 → seed → verification',
  '',
];

for (const section of sections) {
  parts.push('-- ' + '='.repeat(72));
  parts.push(`-- ${section.title}`);
  parts.push(`-- Source: ${section.path}`);
  parts.push('-- ' + '='.repeat(72));
  parts.push('');
  parts.push(readFileSync(join(root, section.path), 'utf8').trim());
  parts.push('');
}

parts.push('-- ' + '='.repeat(72));
parts.push('-- Verification queries');
parts.push('-- ' + '='.repeat(72));
parts.push('');
parts.push(`select count(*) as active_knowledge_documents
from public.knowledge_documents
where is_active = true;

select to_regclass('public.knowledge_documents') as knowledge_documents;
select to_regclass('public.agent_conversations') as agent_conversations;
select to_regclass('public.agent_messages') as agent_messages;
select to_regclass('public.agent_runs') as agent_runs;
select to_regclass('public.email_agent_events') as email_agent_events;

select proname
from pg_proc
where proname in (
  'search_knowledge_documents',
  'lookup_user_id_by_email',
  'check_email_message_processed',
  'check_email_sender_rate_limit',
  'register_email_agent_event'
)
order by proname;
`);

writeFileSync(outPath, `${parts.join('\n')}\n`);
console.log(`Wrote ${outPath}`);
