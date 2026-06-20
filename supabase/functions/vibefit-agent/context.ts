import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.49.1';

export interface ProgressSummary {
  weeksCount: number;
  averageAdherencePercent: number | null;
  averageEnergy: number | null;
  averageDifficulty: number | null;
  adherenceTrend: 'up' | 'stable' | 'down' | 'unknown';
  totalCompletedSessions: number;
  totalPlannedSessions: number;
  recentWeekComparison: string | null;
  descriptiveLines: string[];
  analyticsInsights: string[];
}

type CheckinRow = {
  week_start: string;
  planned_sessions: number;
  completed_sessions: number;
  adherence_rate: number;
  energy_level: number;
  difficulty_level: number;
};

function roundPercent(rate: number): number {
  const normalized = rate > 1 ? rate / 100 : rate;
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100);
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function formatDelta(current: number | null, previous: number | null, label: string): string | null {
  if (current === null || previous === null) return null;
  const delta = Math.round((current - previous) * 10) / 10;
  if (Math.abs(delta) < 0.3) return `${label} مستقر مقارنة بالأسبوع السابق.`;
  if (delta > 0) return `${label} ارتفع مقارنة بالأسبوع السابق (+${delta}).`;
  return `${label} انخفض مقارنة بالأسبوع السابق (${delta}).`;
}

export function buildProgressSummary(checkins: CheckinRow[]): ProgressSummary {
  if (checkins.length === 0) {
    return {
      weeksCount: 0,
      averageAdherencePercent: null,
      averageEnergy: null,
      averageDifficulty: null,
      adherenceTrend: 'unknown',
      totalCompletedSessions: 0,
      totalPlannedSessions: 0,
      recentWeekComparison: null,
      descriptiveLines: ['لا توجد متابعات أسبوعية مسجّلة بعد.'],
      analyticsInsights: ['لا توجد بيانات كافية لتحليل الالتزام أو الطاقة.'],
    };
  }

  const adherencePercents = checkins.map((row) =>
    roundPercent(row.adherence_rate ?? row.completed_sessions / Math.max(row.planned_sessions, 1)),
  );
  const energyLevels = checkins.map((row) => Number(row.energy_level));
  const difficultyLevels = checkins.map((row) => Number(row.difficulty_level));

  const avgAdherence = average(adherencePercents);
  const avgEnergy = average(energyLevels);
  const avgDifficulty = average(difficultyLevels);
  const totalCompletedSessions = checkins.reduce((sum, row) => sum + Number(row.completed_sessions), 0);
  const totalPlannedSessions = checkins.reduce((sum, row) => sum + Number(row.planned_sessions), 0);

  let adherenceTrend: ProgressSummary['adherenceTrend'] = 'unknown';
  if (checkins.length >= 2) {
    const recent = adherencePercents.slice(0, Math.ceil(checkins.length / 2));
    const older = adherencePercents.slice(Math.ceil(checkins.length / 2));
    const recentAvg = average(recent) ?? 0;
    const olderAvg = average(older) ?? 0;
    const delta = recentAvg - olderAvg;
    if (delta >= 5) adherenceTrend = 'up';
    else if (delta <= -5) adherenceTrend = 'down';
    else adherenceTrend = 'stable';
  }

  const latest = checkins[0];
  const previous = checkins[1];
  const recentWeekComparison =
    formatDelta(
      latest ? Number(latest.energy_level) : null,
      previous ? Number(previous.energy_level) : null,
      'طاقتك',
    ) ??
    formatDelta(
      latest ? adherencePercents[0] : null,
      previous ? adherencePercents[1] : null,
      'التزامك',
    );

  const lines: string[] = [`عدد الأسابيع المسجّلة: ${checkins.length}.`];

  if (avgAdherence !== null) lines.push(`متوسط الالتزام: ${avgAdherence}%.`);
  if (avgEnergy !== null) lines.push(`متوسط الطاقة (من 5): ${avgEnergy}.`);
  if (avgDifficulty !== null) lines.push(`متوسط الصعوبة (من 5): ${avgDifficulty}.`);
  lines.push(`إجمالي الجلسات المكتملة: ${totalCompletedSessions} من ${totalPlannedSessions} مخططة.`);

  if (adherenceTrend === 'up') lines.push('اتجاه الالتزام: صاعد.');
  if (adherenceTrend === 'stable') lines.push('اتجاه الالتزام: ثابت.');
  if (adherenceTrend === 'down') lines.push('اتجاه الالتزام: هابط.');
  if (recentWeekComparison) lines.push(recentWeekComparison);

  const analyticsInsights: string[] = [];
  if (latest) {
    analyticsInsights.push(
      `آخر متابعة: ${latest.completed_sessions}/${latest.planned_sessions} جلسات، طاقة ${latest.energy_level}/5، صعوبة ${latest.difficulty_level}/5.`,
    );
  }
  if (checkins.length >= 2 && previous) {
    analyticsInsights.push(
      `الأسبوع السابق: ${previous.completed_sessions}/${previous.planned_sessions} جلسات، طاقة ${previous.energy_level}/5.`,
    );
  }

  return {
    weeksCount: checkins.length,
    averageAdherencePercent: avgAdherence,
    averageEnergy: avgEnergy,
    averageDifficulty: avgDifficulty,
    adherenceTrend,
    totalCompletedSessions,
    totalPlannedSessions,
    recentWeekComparison,
    descriptiveLines: lines,
    analyticsInsights,
  };
}

export interface UserContextPayload {
  profile: Record<string, unknown> | null;
  assessment: Record<string, unknown> | null;
  recommendation: Record<string, unknown> | null;
  progressSummary: ProgressSummary;
  hasPersonalData: boolean;
}

export async function gatherUserContext(
  supabaseAdmin: SupabaseClient,
  userId: string,
  includePersonal: boolean,
): Promise<UserContextPayload> {
  if (!includePersonal || !userId) {
    return {
      profile: null,
      assessment: null,
      recommendation: null,
      progressSummary: buildProgressSummary([]),
      hasPersonalData: false,
    };
  }

  const [profileResult, assessmentResult, checkinsResult] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('display_name, created_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('assessments')
      .select(
        'id, primary_goal, experience_level, activity_level, training_days_per_week, session_duration_minutes, training_location, equipment, constraints_notes',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('weekly_checkins')
      .select(
        'week_start, planned_sessions, completed_sessions, adherence_rate, energy_level, difficulty_level',
      )
      .eq('user_id', userId)
      .order('week_start', { ascending: false })
      .limit(8),
  ]);

  let recommendation: Record<string, unknown> | null = null;

  if (assessmentResult.data?.id) {
    const { data } = await supabaseAdmin
      .from('recommendations')
      .select('summary, weekly_plan, generation_type, status, created_at')
      .eq('assessment_id', assessmentResult.data.id as string)
      .maybeSingle();
    recommendation = data;
  } else {
    const { data } = await supabaseAdmin
      .from('recommendations')
      .select('summary, weekly_plan, generation_type, status, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    recommendation = data;
  }

  const checkins = (checkinsResult.data ?? []) as CheckinRow[];
  const progressSummary = buildProgressSummary(checkins);

  const hasPersonalData = Boolean(
    profileResult.data || assessmentResult.data || recommendation || checkins.length > 0,
  );

  return {
    profile: profileResult.data,
    assessment: assessmentResult.data,
    recommendation,
    progressSummary,
    hasPersonalData,
  };
}
