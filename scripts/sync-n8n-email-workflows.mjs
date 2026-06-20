#!/usr/bin/env node
/**
 * Generates n8n email agent workflow JSON from shared code snippets.
 * Run: node scripts/sync-n8n-email-workflows.mjs
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FORMAT_REPLY_CODE,
  HASH_SENDER_CODE,
  NORMALIZE_EMAIL_CODE,
  VALIDATE_EMAIL_CODE,
  WEBHOOK_NORMALIZE_CODE,
} from '../n8n/lib/emailAgentCode.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const WRAP_USER_CODE = `
const item = $('Hash Sender').first().json;
const lookup = $input.first().json;
let user_id = null;
if (typeof lookup === 'string' && lookup.length > 10) user_id = lookup;
return [{ json: { ...item, user_found: Boolean(user_id), user_id } }];
`.trim();

const CHECK_DUPLICATE_CODE = `
const processed = $input.first().json;
const item = $('Hash Sender').first().json;
const already = processed === true;
return [{ json: { ...item, already_processed_db: already } }];
`.trim();

const CHECK_RATE_CODE = `
const allowed = $input.first().json;
const item = $('Hash Sender').first().json;
return [{ json: { ...item, rate_ok: allowed === true } }];
`.trim();

const AGENT_ERROR_REPLY_CODE = `
const formatted = $input.first().json;
return [{
  json: {
    ...formatted,
    reply_body: 'مرحبًا،\\n\\nتعذر إكمال الرد الآن. حاول مرة أخرى بعد قليل.\\n\\nفريق VibeFit',
    agent_success: false,
  },
}];
`.trim();

const TEST_PREVIEW_CODE = `
const formatted = $input.first().json;
const agent = $('Call VibeFit Agent').first().json;
const response = agent.response || {};
const userFound = typeof agent.user_found === 'boolean' ? agent.user_found : formatted.user_found;

return [{
  json: {
    success: Boolean(formatted.agent_success),
    answer: response.answer || null,
    recommended_actions: Array.isArray(response.recommended_actions) ? response.recommended_actions : [],
    insights: Array.isArray(response.insights) ? response.insights : [],
    sources: Array.isArray(response.sources) ? response.sources : [],
    safety_notice: response.safety_notice || null,
    user_found: userFound,
    used_rag: Boolean(response.used_rag),
    used_personal_data: Boolean(response.used_personal_data),
    preview: formatted.reply_body,
    reply_subject: formatted.reply_subject,
    thread_id: formatted.thread_id,
  },
}];
`.trim();

function pos(x, y) {
  return [x, y];
}

function httpSupabaseRpc(nodeName, rpcName, bodyExpr, position, notes) {
  return {
    parameters: {
      method: 'POST',
      url: `={{$env.SUPABASE_URL}}/rest/v1/rpc/${rpcName}`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'apikey', value: '={{$env.SUPABASE_SERVICE_ROLE_KEY}}' },
          { name: 'Authorization', value: '=Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}' },
        ],
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: bodyExpr,
      options: { timeout: 30000 },
    },
    name: nodeName,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position,
    notes,
  };
}

function codeNode(name, jsCode, position, notes) {
  return {
    parameters: { jsCode },
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
    notes,
  };
}

function ifNode(name, leftValue, operation, rightValue, position) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [
          {
            id: name.replace(/\s/g, '-'),
            leftValue,
            rightValue,
            operator: { type: operation === 'true' || operation === 'false' ? 'boolean' : 'string', operation },
          },
        ],
        combinator: 'and',
      },
    },
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2,
    position,
  };
}

function buildSharedNodes() {
  return [
    codeNode('Hash Sender', HASH_SENDER_CODE, pos(680, 300), 'SHA-256 hash — no raw email in events table'),
    codeNode('Validate Message', VALIDATE_EMAIL_CODE, pos(900, 300), 'Reject spam, drafts, empty, VibeFit self-mail'),
    ifNode('Validation OK?', '={{$json.validation_ok}}', 'true', true, pos(1120, 300)),
    httpSupabaseRpc(
      'Check Duplicate',
      'check_email_message_processed',
      '={{ JSON.stringify({ p_message_id: $("Hash Sender").item.json.message_id }) }}',
      pos(1340, 220),
      'Skip duplicate Gmail message_id',
    ),
    codeNode('Parse Duplicate', CHECK_DUPLICATE_CODE, pos(1560, 220), 'Map RPC boolean'),
    ifNode('Not Duplicate?', '={{$json.already_processed_db}}', 'false', false, pos(1780, 220)),
    httpSupabaseRpc(
      'Check Rate Limit',
      'check_email_sender_rate_limit',
      '={{ JSON.stringify({ p_sender_hash: $("Hash Sender").item.json.sender_hash, p_max_per_hour: 10 }) }}',
      pos(2000, 220),
      'Max 10 emails/hour per sender hash',
    ),
    codeNode('Parse Rate Limit', CHECK_RATE_CODE, pos(2220, 220), 'Map RPC boolean'),
    ifNode('Rate OK?', '={{$json.rate_ok}}', 'true', true, pos(2440, 220)),
    httpSupabaseRpc(
      'Lookup User',
      'lookup_user_id_by_email',
      '={{ JSON.stringify({ target_email: $("Hash Sender").item.json.sender_email }) }}',
      pos(2660, 220),
      'Preview lookup — Agent resolves user in backend',
    ),
    codeNode('Identify User', WRAP_USER_CODE, pos(2880, 220), 'user_found flag for reply footer'),
    {
      parameters: {
        method: 'POST',
        url: '={{$env.VIBEFIT_AGENT_URL}}',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'x-vibefit-agent-secret', value: '={{$env.VIBEFIT_AGENT_SECRET}}' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ message: $("Hash Sender").item.json.normalized_question, channel: "email", external_sender: $("Hash Sender").item.json.sender_email, conversation_id: $("Hash Sender").item.json.thread_id }) }}',
        options: { timeout: 65000, response: { response: { neverError: true } } },
      },
      name: 'Call VibeFit Agent',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: pos(3100, 220),
      notes: 'RAG + personal data decided inside Edge Function',
    },
    codeNode('Format Reply', FORMAT_REPLY_CODE, pos(3320, 220), 'No technical fields in email body'),
    ifNode('Agent OK?', '={{$json.agent_success}}', 'true', true, pos(3540, 220)),
    codeNode('Agent Error Reply', AGENT_ERROR_REPLY_CODE, pos(3540, 420), 'Safe fallback body'),
    httpSupabaseRpc(
      'Register Processed',
      'register_email_agent_event',
      '={{ JSON.stringify({ p_message_id: $("Format Reply").item.json.message_id, p_thread_id: $("Format Reply").item.json.thread_id, p_sender_hash: $("Hash Sender").item.json.sender_hash, p_status: "processed", p_error_code: null }) }}',
      pos(4200, 120),
      'Log success without secrets',
    ),
    httpSupabaseRpc(
      'Register Failed',
      'register_email_agent_event',
      '={{ JSON.stringify({ p_message_id: $("Format Reply").item.json.message_id, p_thread_id: $("Format Reply").item.json.thread_id, p_sender_hash: $("Hash Sender").item.json.sender_hash, p_status: "failed", p_error_code: $("Format Reply").item.json.agent_error || "AGENT_FAILED" }) }}',
      pos(4200, 420),
      'Log failure without secrets',
    ),
    httpSupabaseRpc(
      'Register Ignored',
      'register_email_agent_event',
      '={{ JSON.stringify({ p_message_id: $json.message_id, p_thread_id: $json.thread_id || null, p_sender_hash: $json.sender_hash, p_status: "ignored", p_error_code: ($json.validation_errors || ["IGNORED"]).join(",") }) }}',
      pos(1340, 520),
      'Log ignored/skipped messages',
    ),
  ];
}

function buildPipelineConnections(successNode, errorNode) {
  return {
    'Hash Sender': { main: [[{ node: 'Validate Message', type: 'main', index: 0 }]] },
    'Validate Message': { main: [[{ node: 'Validation OK?', type: 'main', index: 0 }]] },
    'Validation OK?': {
      main: [
        [{ node: 'Check Duplicate', type: 'main', index: 0 }],
        [{ node: 'Register Ignored', type: 'main', index: 0 }],
      ],
    },
    'Check Duplicate': { main: [[{ node: 'Parse Duplicate', type: 'main', index: 0 }]] },
    'Parse Duplicate': { main: [[{ node: 'Not Duplicate?', type: 'main', index: 0 }]] },
    'Not Duplicate?': {
      main: [
        [{ node: 'Check Rate Limit', type: 'main', index: 0 }],
        [{ node: 'Register Ignored', type: 'main', index: 0 }],
      ],
    },
    'Check Rate Limit': { main: [[{ node: 'Parse Rate Limit', type: 'main', index: 0 }]] },
    'Parse Rate Limit': { main: [[{ node: 'Rate OK?', type: 'main', index: 0 }]] },
    'Rate OK?': {
      main: [
        [{ node: 'Lookup User', type: 'main', index: 0 }],
        [{ node: 'Register Ignored', type: 'main', index: 0 }],
      ],
    },
    'Lookup User': { main: [[{ node: 'Identify User', type: 'main', index: 0 }]] },
    'Identify User': { main: [[{ node: 'Call VibeFit Agent', type: 'main', index: 0 }]] },
    'Call VibeFit Agent': { main: [[{ node: 'Format Reply', type: 'main', index: 0 }]] },
    'Format Reply': { main: [[{ node: 'Agent OK?', type: 'main', index: 0 }]] },
    'Agent OK?': {
      main: [
        [{ node: successNode, type: 'main', index: 0 }],
        [{ node: errorNode, type: 'main', index: 0 }],
      ],
    },
  };
}

function buildEmailWorkflow() {
  const nodes = [
    {
      parameters: {
        pollTimes: { item: [{ mode: 'everyMinute' }] },
        filters: {
          q: '=-from:{{$env.VIBEFIT_GMAIL_ACCOUNT}} -label:vibefit-agent-processed is:inbox -in:spam -in:drafts',
        },
      },
      name: 'Gmail Trigger',
      type: 'n8n-nodes-base.gmailTrigger',
      typeVersion: 1,
      position: pos(240, 300),
      credentials: {
        gmailOAuth2: { id: 'GMAIL_OAUTH_CREDENTIAL', name: 'VibeFit Gmail' },
      },
      notes: 'Inbound only — excludes VibeFit account, processed label, spam, drafts',
    },
    codeNode('Normalize Email', NORMALIZE_EMAIL_CODE, pos(460, 300), 'Extract + clean question'),
    ...buildSharedNodes(),
    {
      parameters: {
        resource: 'message',
        operation: 'reply',
        messageId: '={{$json.message_id}}',
        message: '={{$json.reply_body}}',
        options: { replyToSenderOnly: true },
      },
      name: 'Gmail Reply',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: pos(3760, 120),
      credentials: {
        gmailOAuth2: { id: 'GMAIL_OAUTH_CREDENTIAL', name: 'VibeFit Gmail' },
      },
      notes: 'Reply in same thread',
    },
    {
      parameters: {
        resource: 'message',
        operation: 'reply',
        messageId: '={{$json.message_id}}',
        message: '={{$json.reply_body}}',
        options: { replyToSenderOnly: true },
      },
      name: 'Gmail Error Reply',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: pos(3760, 420),
      credentials: {
        gmailOAuth2: { id: 'GMAIL_OAUTH_CREDENTIAL', name: 'VibeFit Gmail' },
      },
      notes: 'Send safe fallback on agent failure',
    },
    {
      parameters: {
        resource: 'message',
        operation: 'addLabels',
        messageId: '={{$("Format Reply").item.json.message_id}}',
        labelIds: ['vibefit-agent-processed'],
      },
      name: 'Gmail Mark Processed',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: pos(4420, 120),
      credentials: {
        gmailOAuth2: { id: 'GMAIL_OAUTH_CREDENTIAL', name: 'VibeFit Gmail' },
      },
      notes: 'Prevent reprocessing loop',
    },
  ];

  const connections = {
    'Gmail Trigger': { main: [[{ node: 'Normalize Email', type: 'main', index: 0 }]] },
    'Normalize Email': { main: [[{ node: 'Hash Sender', type: 'main', index: 0 }]] },
    ...buildPipelineConnections('Gmail Reply', 'Agent Error Reply'),
    'Gmail Reply': { main: [[{ node: 'Register Processed', type: 'main', index: 0 }]] },
    'Register Processed': { main: [[{ node: 'Gmail Mark Processed', type: 'main', index: 0 }]] },
    'Agent Error Reply': { main: [[{ node: 'Register Failed', type: 'main', index: 0 }]] },
  };

  return {
    name: 'VibeFit Email Agent',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    meta: { templateCredsSetupCompleted: false },
    tags: [{ name: 'VibeFit' }, { name: 'Email Agent' }],
  };
}

function buildTestWorkflow() {
  const nodes = [
    {
      parameters: {
        httpMethod: 'POST',
        path: 'vibefit-email-agent-test',
        responseMode: 'lastNode',
        options: {},
      },
      name: 'Webhook Test',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: pos(240, 300),
      webhookId: 'vibefit-email-agent-test',
      notes: 'POST test payload — no Gmail send',
    },
    codeNode('Webhook Normalize', WEBHOOK_NORMALIZE_CODE, pos(460, 300), 'Map test JSON to Gmail shape'),
    codeNode('Normalize Email', NORMALIZE_EMAIL_CODE, pos(680, 300), 'Same cleaner as production'),
    ...buildSharedNodes(),
    codeNode('Preview JSON', TEST_PREVIEW_CODE, pos(3760, 220), 'Return preview instead of Gmail'),
  ];

  const connections = {
    'Webhook Test': { main: [[{ node: 'Webhook Normalize', type: 'main', index: 0 }]] },
    'Webhook Normalize': { main: [[{ node: 'Normalize Email', type: 'main', index: 0 }]] },
    'Normalize Email': { main: [[{ node: 'Hash Sender', type: 'main', index: 0 }]] },
    ...buildPipelineConnections('Preview JSON', 'Agent Error Reply'),
    'Agent Error Reply': { main: [[{ node: 'Preview JSON', type: 'main', index: 0 }]] },
  };

  return {
    name: 'VibeFit Email Agent Test Webhook',
    nodes,
    connections,
    settings: { executionOrder: 'v1' },
    meta: { templateCredsSetupCompleted: false },
    tags: [{ name: 'VibeFit' }, { name: 'Email Agent Test' }],
  };
}

writeFileSync(
  join(root, 'n8n/vibefit-email-agent.workflow.json'),
  `${JSON.stringify(buildEmailWorkflow(), null, 2)}\n`,
);
writeFileSync(
  join(root, 'n8n/vibefit-email-agent-test.workflow.json'),
  `${JSON.stringify(buildTestWorkflow(), null, 2)}\n`,
);

console.log('Synced n8n email agent workflows.');
