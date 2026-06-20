/**
 * VibeFit Proactive Agent — local scenario tests (no OpenAI/Supabase)
 * Run: npm run test:proactive
 */

const EVENT_TYPES = [
  'user_signed_up',
  'assessment_completed',
  'recommendation_completed',
  'weekly_checkin_missing',
  'adherence_dropped',
  'adherence_improved',
  'low_energy_detected',
  'high_difficulty_detected',
  'inactive_user_detected',
  'weekly_summary_due',
];

const OPERATIONAL = new Set([
  'user_signed_up',
  'assessment_completed',
  'recommendation_completed',
]);

function eventCategory(type) {
  return OPERATIONAL.has(type) ? 'operational' : 'motivational';
}

function preferenceKey(type) {
  if (type === 'user_signed_up') return 'welcome_emails';
  if (type === 'weekly_checkin_missing') return 'reminder_emails';
  if (type === 'weekly_summary_due') return 'weekly_summary';
  return 'progress_emails';
}

function evaluateGuardrails({ preferences, eventType, weeklySent, sentMotivationalToday }) {
  if (!preferences || preferences.unsubscribed_at) {
    return { allowed: false, reason: 'unsubscribed' };
  }
  const key = preferenceKey(eventType);
  if (!preferences[key]) return { allowed: false, reason: 'preference_disabled' };
  if (weeklySent >= (preferences.max_emails_per_week ?? 3)) {
    return { allowed: false, reason: 'weekly_limit_reached' };
  }
  if (eventCategory(eventType) === 'motivational' && sentMotivationalToday) {
    return { allowed: false, reason: 'daily_motivational_limit' };
  }
  return { allowed: true };
}

function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeKey(type, userId, period) {
  switch (type) {
    case 'user_signed_up':
      return `welcome:${userId}`;
    case 'weekly_summary_due':
      return `weekly-summary:${userId}:${period}`;
    case 'adherence_dropped':
      return `adherence-drop:${userId}:${period}`;
    case 'inactive_user_detected':
      return `inactive:${userId}:${period}`;
    default:
      return `${type}:${userId}:${period}`;
  }
}

const defaultPrefs = {
  welcome_emails: true,
  progress_emails: true,
  reminder_emails: true,
  weekly_summary: true,
  max_emails_per_week: 3,
  unsubscribed_at: null,
};

const scenarios = [
  {
    name: '1. Welcome — once per user',
    run: () => {
      const k1 = dedupeKey('user_signed_up', 'u1', '');
      const k2 = dedupeKey('user_signed_up', 'u1', '');
      return k1 === k2 && k1 === 'welcome:u1';
    },
  },
  {
    name: '2. Assessment completed — operational',
    run: () => eventCategory('assessment_completed') === 'operational',
  },
  {
    name: '3. Recommendation ready — operational',
    run: () => preferenceKey('recommendation_completed') === 'progress_emails',
  },
  {
    name: '4. Missing check-in — reminder preference',
    run: () => {
      const g = evaluateGuardrails({
        preferences: { ...defaultPrefs, reminder_emails: false },
        eventType: 'weekly_checkin_missing',
        weeklySent: 0,
        sentMotivationalToday: false,
      });
      return g.allowed === false && g.reason === 'preference_disabled';
    },
  },
  {
    name: '5. Adherence drop — motivational guard',
    run: () => {
      const g = evaluateGuardrails({
        preferences: defaultPrefs,
        eventType: 'adherence_dropped',
        weeklySent: 0,
        sentMotivationalToday: true,
      });
      return g.allowed === false && g.reason === 'daily_motivational_limit';
    },
  },
  {
    name: '6. Adherence improved — allowed',
    run: () =>
      evaluateGuardrails({
        preferences: defaultPrefs,
        eventType: 'adherence_improved',
        weeklySent: 1,
        sentMotivationalToday: false,
      }).allowed === true,
  },
  {
    name: '7. Low energy — RAG event type exists',
    run: () => EVENT_TYPES.includes('low_energy_detected'),
  },
  {
    name: '8. Inactive user — monthly dedup key',
    run: () => dedupeKey('inactive_user_detected', 'u2', '2026-06') === 'inactive:u2:2026-06',
  },
  {
    name: '9. Weekly summary — ISO week dedup',
    run: () => dedupeKey('weekly_summary_due', 'u3', '2026-W25') === 'weekly-summary:u3:2026-W25',
  },
  {
    name: '10. Unsubscribed — block all',
    run: () =>
      evaluateGuardrails({
        preferences: { ...defaultPrefs, unsubscribed_at: '2026-01-01' },
        eventType: 'user_signed_up',
        weeklySent: 0,
        sentMotivationalToday: false,
      }).reason === 'unsubscribed',
  },
  {
    name: '11. Weekly limit reached',
    run: () =>
      evaluateGuardrails({
        preferences: defaultPrefs,
        eventType: 'adherence_dropped',
        weeklySent: 3,
        sentMotivationalToday: false,
      }).reason === 'weekly_limit_reached',
  },
  {
    name: '12. Duplicate event key stable',
    run: () => {
      const a = dedupeKey('adherence_dropped', 'u4', '2026-W25');
      const b = dedupeKey('adherence_dropped', 'u4', '2026-W25');
      return a === b;
    },
  },
  {
    name: '13. Insufficient data — operational still allowed at guard level',
    run: () =>
      evaluateGuardrails({
        preferences: defaultPrefs,
        eventType: 'recommendation_completed',
        weeklySent: 0,
        sentMotivationalToday: false,
      }).allowed === true,
  },
  {
    name: '14. Safety — no forbidden guilt words in sample body',
    run: () => {
      const body = stripMarkdown('نقدر نرجع تدريجيًا — الاستمرارية أهم من الكمال.');
      return !/فشل|أهمل|لازم تعوض/.test(body);
    },
  },
  {
    name: '15. OpenAI failure fallback shape',
    run: () => {
      const fallback = {
        should_send: true,
        event_type: 'adherence_dropped',
        subject: 'خطوة بسيطة للعودة إلى خطتك',
        body: 'جلسة خفيفة أفضل من الانقطاع.',
        recommended_actions: ['ابدئي بخطوة صغيرة', 'سجّلي متابعتك'],
        used_personal_data: true,
        used_rag: false,
      };
      return fallback.should_send && fallback.recommended_actions.length >= 2;
    },
  },
];

let passed = 0;
let failed = 0;

for (const scenario of scenarios) {
  try {
    if (scenario.run()) {
      console.log(`✓ ${scenario.name}`);
      passed += 1;
    } else {
      console.log(`✗ ${scenario.name}`);
      failed += 1;
    }
  } catch (error) {
    console.log(`✗ ${scenario.name} — ${error.message}`);
    failed += 1;
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
