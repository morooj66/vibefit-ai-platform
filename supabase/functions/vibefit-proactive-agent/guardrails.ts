import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';
import type { EventConfig, ProactiveEventType } from './events.ts';

export interface EmailPreferences {
  welcome_emails: boolean;
  progress_emails: boolean;
  reminder_emails: boolean;
  weekly_summary: boolean;
  marketing_emails: boolean;
  max_emails_per_week: number;
  unsubscribed_at: string | null;
}

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export async function loadEmailPreferences(
  supabaseAdmin: SupabaseClient,
  userId: string,
): Promise<EmailPreferences | null> {
  const { data, error } = await supabaseAdmin
    .from('email_preferences')
    .select(
      'welcome_emails, progress_emails, reminder_emails, weekly_summary, marketing_emails, max_emails_per_week, unsubscribed_at',
    )
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[proactive-agent] preferences load failed', { code: error.code });
    return null;
  }

  return data as EmailPreferences | null;
}

export async function evaluateSendGuardrails(
  supabaseAdmin: SupabaseClient,
  userId: string,
  eventType: ProactiveEventType,
  config: EventConfig,
  preferences: EmailPreferences | null,
): Promise<GuardrailResult> {
  if (!preferences) {
    return { allowed: false, reason: 'preferences_missing' };
  }

  if (preferences.unsubscribed_at) {
    return { allowed: false, reason: 'unsubscribed' };
  }

  const prefEnabled = preferences[config.preferenceKey];
  if (!prefEnabled) {
    return { allowed: false, reason: 'preference_disabled' };
  }

  const [{ data: weeklyCount }, { data: sentToday }, { data: userEmail }] = await Promise.all([
    supabaseAdmin.rpc('count_proactive_emails_sent', { p_user_id: userId, p_days: 7 }),
    config.category === 'motivational'
      ? supabaseAdmin.rpc('had_motivational_email_today', { p_user_id: userId })
      : Promise.resolve({ data: false }),
    supabaseAdmin.rpc('get_user_email_for_proactive', { p_user_id: userId }),
  ]);

  if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
    return { allowed: false, reason: 'email_missing' };
  }

  const maxWeekly = preferences.max_emails_per_week ?? 3;
  if (typeof weeklyCount === 'number' && weeklyCount >= maxWeekly) {
    return { allowed: false, reason: 'weekly_limit_reached' };
  }

  if (config.category === 'motivational' && sentToday === true) {
    return { allowed: false, reason: 'daily_motivational_limit' };
  }

  return { allowed: true };
}
