export const FORMAT_PROACTIVE_EMAIL_CODE = `
const agent = $input.first().json;
const event = $('Split Events').first().json;

if (agent.should_send !== true) {
  return [{
    json: {
      ...event,
      skip_send: true,
      reason_not_sent: agent.reason_not_sent || 'should_send_false',
    },
  }];
}

const lines = [
  agent.greeting || 'أهلًا،',
  '',
  agent.body || '',
];

if (Array.isArray(agent.recommended_actions) && agent.recommended_actions.length > 0) {
  lines.push('', 'خطوات مقترحة:');
  agent.recommended_actions.slice(0, 4).forEach((step, index) => {
    lines.push((index + 1) + '. ' + step);
  });
}

lines.push('', (agent.cta_text || 'افتحي VibeFit') + ': ' + (agent.cta_url || ''));
if (agent.footer_notice) lines.push('', agent.footer_notice);
lines.push('', 'فريق VibeFit');

return [{
  json: {
    ...event,
    skip_send: false,
    email_subject: agent.subject,
    email_body: lines.join('\\n'),
    used_rag: Boolean(agent.used_rag),
    used_personal_data: Boolean(agent.used_personal_data),
  },
}];
`.trim();

export const CHECK_PREFERENCES_CODE = `
const event = $input.first().json;
const pref = $('Fetch Preferences').first().json;

const type = event.event_type;
let allowed = true;
let reason = null;

if (pref.unsubscribed_at) {
  allowed = false;
  reason = 'unsubscribed';
} else if (type === 'user_signed_up' && !pref.welcome_emails) {
  allowed = false;
  reason = 'welcome_disabled';
} else if (type === 'weekly_checkin_missing' && !pref.reminder_emails) {
  allowed = false;
  reason = 'reminders_disabled';
} else if (type === 'weekly_summary_due' && !pref.weekly_summary) {
  allowed = false;
  reason = 'weekly_summary_disabled';
} else if (
  ['adherence_dropped','adherence_improved','low_energy_detected','high_difficulty_detected','inactive_user_detected','assessment_completed','recommendation_completed'].includes(type)
  && !pref.progress_emails
) {
  allowed = false;
  reason = 'progress_disabled';
}

return [{ json: { ...event, pref_ok: allowed, pref_reason: reason } }];
`.trim();

export const MARK_SENT_CODE = `
const event = $('Split Events').first().json;
const gmail = $input.first().json;
const messageId = gmail.id || gmail.messageId || null;
return [{
  json: {
    event_id: event.id,
    status: 'sent',
    email_message_id: messageId,
  },
}];
`.trim();

export const MARK_SKIPPED_CODE = `
const event = $('Split Events').first().json;
const agent = $('Call Proactive Agent').first().json;
return [{
  json: {
    event_id: event.id,
    status: 'skipped',
    error_code: agent.reason_not_sent || 'should_send_false',
  },
}];
`.trim();

export const MARK_FAILED_CODE = `
const event = $('Split Events').first().json;
const err = $input.first().json;
return [{
  json: {
    event_id: event.id,
    status: 'failed',
    error_code: err.error || err.message || 'AGENT_FAILED',
  },
}];
`.trim();
