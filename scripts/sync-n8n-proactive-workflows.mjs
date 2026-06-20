#!/usr/bin/env node
/**
 * Generates n8n proactive email workflow JSON files.
 * Run: npm run sync:n8n-proactive
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECK_PREFERENCES_CODE,
  FORMAT_PROACTIVE_EMAIL_CODE,
  MARK_FAILED_CODE,
  MARK_SENT_CODE,
  MARK_SKIPPED_CODE,
} from '../n8n/lib/proactiveEmailCode.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

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
      options: { timeout: 60000 },
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

function buildProactiveWorkflow() {
  const nodes = [
    {
      parameters: { rule: { interval: [{ field: 'hours', hoursInterval: 1 }] } },
      name: 'Hourly Schedule',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: pos(0, 0),
      notes: 'Runs detection + processes pending events hourly',
    },
    httpSupabaseRpc(
      'Run Detection',
      'run_proactive_lifecycle_detection',
      '={}',
      pos(220, 0),
      'Enqueue missing/inactivity/adherence events',
    ),
    httpSupabaseRpc(
      'Fetch Pending Events',
      'fetch_pending_proactive_events',
      '={{ JSON.stringify({ p_limit: 15 }) }}',
      pos(440, 0),
      'Get pending proactive_email_events',
    ),
    {
      parameters: { batchSize: 1, options: {} },
      name: 'Split Events',
      type: 'n8n-nodes-base.splitInBatches',
      typeVersion: 3,
      position: pos(660, 0),
    },
    {
      parameters: {
        url: '={{$env.SUPABASE_URL}}/rest/v1/email_preferences?user_id=eq.{{$json.user_id}}&select=*',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'apikey', value: '={{$env.SUPABASE_SERVICE_ROLE_KEY}}' },
            { name: 'Authorization', value: '=Bearer {{$env.SUPABASE_SERVICE_ROLE_KEY}}' },
          ],
        },
        options: { timeout: 30000 },
      },
      name: 'Fetch Preferences',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: pos(880, 0),
    },
    codeNode('Check Preferences', CHECK_PREFERENCES_CODE, pos(1100, 0), 'Respect unsubscribe & flags'),
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, typeValidation: 'strict' },
          conditions: [
            {
              id: 'pref-ok',
              leftValue: '={{$json.pref_ok}}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'equals' },
            },
          ],
          combinator: 'and',
        },
      },
      name: 'IF Preferences OK',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: pos(1320, 0),
    },
    httpSupabaseRpc(
      'Mark Processing',
      'update_proactive_event_status',
      '={{ JSON.stringify({ p_event_id: $("Split Events").item.json.id, p_status: "processing" }) }}',
      pos(1540, -80),
      'Lock event while processing',
    ),
    {
      parameters: {
        method: 'POST',
        url: '={{$env.VIBEFIT_PROACTIVE_AGENT_URL || $env.VIBEFIT_AGENT_URL.replace("vibefit-agent","vibefit-proactive-agent")}}',
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Content-Type', value: 'application/json' },
            { name: 'x-vibefit-proactive-secret', value: '={{$env.VIBEFIT_PROACTIVE_AGENT_SECRET || $env.VIBEFIT_AGENT_SECRET}}' },
          ],
        },
        sendBody: true,
        specifyBody: 'json',
        jsonBody:
          '={{ JSON.stringify({ event_type: $("Split Events").item.json.event_type, user_id: $("Split Events").item.json.user_id, source_record_id: $("Split Events").item.json.source_record_id, event_id: $("Split Events").item.json.id, channel: "email", metadata: $("Split Events").item.json.metadata || {} }) }}',
        options: { timeout: 90000 },
      },
      name: 'Call Proactive Agent',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4.2,
      position: pos(1760, -80),
      notes: 'Server-to-server only',
    },
    {
      parameters: {
        conditions: {
          options: { caseSensitive: true, typeValidation: 'strict' },
          conditions: [
            {
              id: 'should-send',
              leftValue: '={{$json.should_send}}',
              rightValue: true,
              operator: { type: 'boolean', operation: 'equals' },
            },
          ],
          combinator: 'and',
        },
      },
      name: 'IF Should Send',
      type: 'n8n-nodes-base.if',
      typeVersion: 2.2,
      position: pos(1980, -80),
    },
    codeNode('Format Email', FORMAT_PROACTIVE_EMAIL_CODE, pos(2200, -160), 'Plain text email body'),
    httpSupabaseRpc(
      'Fetch User Email',
      'get_user_email_for_proactive',
      '={{ JSON.stringify({ p_user_id: $("Split Events").item.json.user_id }) }}',
      pos(2420, -160),
      'Resolve recipient from auth.users',
    ),
    {
      parameters: {
        resource: 'message',
        operation: 'send',
        sendTo: '={{$json}}',
        subject: '={{$("Format Email").item.json.email_subject}}',
        emailType: 'text',
        message: '={{$("Format Email").item.json.email_body}}',
        options: {},
      },
      name: 'Gmail Send',
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2.1,
      position: pos(2640, -160),
      notes: 'Sends personalized proactive email',
    },
    codeNode('Prepare Sent Update', MARK_SENT_CODE, pos(2860, -160)),
    httpSupabaseRpc(
      'Mark Sent',
      'update_proactive_event_status',
      '={{ JSON.stringify({ p_event_id: $json.event_id, p_status: "sent", p_email_message_id: $json.email_message_id }) }}',
      pos(3080, -160),
    ),
    codeNode('Prepare Skipped Update', MARK_SKIPPED_CODE, pos(2200, 0)),
    httpSupabaseRpc(
      'Mark Skipped',
      'update_proactive_event_status',
      '={{ JSON.stringify({ p_event_id: $json.event_id, p_status: "skipped", p_error_code: $json.error_code }) }}',
      pos(2420, 0),
    ),
    httpSupabaseRpc(
      'Mark Pref Skipped',
      'update_proactive_event_status',
      '={{ JSON.stringify({ p_event_id: $("Split Events").item.json.id, p_status: "skipped", p_error_code: $json.pref_reason || "preference_blocked" }) }}',
      pos(1540, 120),
    ),
    codeNode('Prepare Failed Update', MARK_FAILED_CODE, pos(2200, 120)),
    httpSupabaseRpc(
      'Mark Failed',
      'update_proactive_event_status',
      '={{ JSON.stringify({ p_event_id: $json.event_id, p_status: "failed", p_error_code: $json.error_code }) }}',
      pos(2420, 120),
    ),
    {
      parameters: {},
      name: 'Continue Batch',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: pos(3300, 0),
    },
  ];

  const connections = {
    'Hourly Schedule': { main: [[{ node: 'Run Detection', type: 'main', index: 0 }]] },
    'Run Detection': { main: [[{ node: 'Fetch Pending Events', type: 'main', index: 0 }]] },
    'Fetch Pending Events': { main: [[{ node: 'Split Events', type: 'main', index: 0 }]] },
    'Split Events': {
      main: [
        [{ node: 'Fetch Preferences', type: 'main', index: 0 }],
        [{ node: 'Continue Batch', type: 'main', index: 0 }],
      ],
    },
    'Fetch Preferences': { main: [[{ node: 'Check Preferences', type: 'main', index: 0 }]] },
    'Check Preferences': { main: [[{ node: 'IF Preferences OK', type: 'main', index: 0 }]] },
    'IF Preferences OK': {
      main: [
        [{ node: 'Mark Processing', type: 'main', index: 0 }],
        [{ node: 'Mark Pref Skipped', type: 'main', index: 0 }],
      ],
    },
    'Mark Processing': { main: [[{ node: 'Call Proactive Agent', type: 'main', index: 0 }]] },
    'Call Proactive Agent': { main: [[{ node: 'IF Should Send', type: 'main', index: 0 }]] },
    'IF Should Send': {
      main: [
        [{ node: 'Format Email', type: 'main', index: 0 }],
        [{ node: 'Prepare Skipped Update', type: 'main', index: 0 }],
      ],
    },
    'Format Email': { main: [[{ node: 'Fetch User Email', type: 'main', index: 0 }]] },
    'Fetch User Email': { main: [[{ node: 'Gmail Send', type: 'main', index: 0 }]] },
    'Gmail Send': { main: [[{ node: 'Prepare Sent Update', type: 'main', index: 0 }]] },
    'Prepare Sent Update': { main: [[{ node: 'Mark Sent', type: 'main', index: 0 }]] },
    'Mark Sent': { main: [[{ node: 'Continue Batch', type: 'main', index: 0 }]] },
    'Prepare Skipped Update': { main: [[{ node: 'Mark Skipped', type: 'main', index: 0 }]] },
    'Mark Skipped': { main: [[{ node: 'Continue Batch', type: 'main', index: 0 }]] },
    'Mark Pref Skipped': { main: [[{ node: 'Continue Batch', type: 'main', index: 0 }]] },
    'Prepare Failed Update': { main: [[{ node: 'Mark Failed', type: 'main', index: 0 }]] },
    'Mark Failed': { main: [[{ node: 'Continue Batch', type: 'main', index: 0 }]] },
    'Continue Batch': { main: [[{ node: 'Split Events', type: 'main', index: 0 }]] },
  };

  return {
    name: 'VibeFit Proactive Email Agent',
    nodes,
    connections,
    pinData: {},
    settings: { executionOrder: 'v1' },
    staticData: null,
    tags: [{ name: 'vibefit' }, { name: 'proactive-email' }],
    triggerCount: 1,
    meta: { templateCredsSetupCompleted: false },
  };
}

function buildWeeklySummaryWorkflow() {
  const nodes = [
    {
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 9 * * 1' }] } },
      name: 'Weekly Monday 9am',
      type: 'n8n-nodes-base.scheduleTrigger',
      typeVersion: 1.2,
      position: pos(0, 0),
      notes: 'Weekly summary detection — Mondays 09:00',
    },
    httpSupabaseRpc(
      'Run Weekly Detection',
      'run_proactive_lifecycle_detection',
      '={}',
      pos(240, 0),
      'Creates weekly_summary_due events via shared detector',
    ),
    {
      parameters: {},
      name: 'Done',
      type: 'n8n-nodes-base.noOp',
      typeVersion: 1,
      position: pos(480, 0),
    },
  ];

  return {
    name: 'VibeFit Weekly Summary Detector',
    nodes,
    connections: {
      'Weekly Monday 9am': { main: [[{ node: 'Run Weekly Detection', type: 'main', index: 0 }]] },
      'Run Weekly Detection': { main: [[{ node: 'Done', type: 'main', index: 0 }]] },
    },
    pinData: {},
    settings: { executionOrder: 'v1' },
    staticData: null,
    tags: [{ name: 'vibefit' }, { name: 'weekly-summary' }],
    triggerCount: 1,
    meta: { templateCredsSetupCompleted: false },
  };
}

writeFileSync(
  join(root, 'n8n/vibefit-proactive-email-agent.workflow.json'),
  JSON.stringify(buildProactiveWorkflow(), null, 2) + '\n',
);
writeFileSync(
  join(root, 'n8n/vibefit-weekly-summary.workflow.json'),
  JSON.stringify(buildWeeklySummaryWorkflow(), null, 2) + '\n',
);

console.log('Synced n8n proactive email workflows.');
