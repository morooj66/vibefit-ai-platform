import { supabase } from '../../lib/supabase';
import { logSupabaseError } from '../../lib/supabaseDebug';
import type { SaveWeeklyCheckinPayload, WeeklyCheckin } from '../../types/checkin';
import {
  calculateAdherenceRate,
  coerceInt,
  resolveAdherenceRate,
} from './checkinCalculations';

export {
  calculateAdherenceRate,
  formatAdherencePercent,
  formatRating,
  formatSessionsLabel,
  formatWeeksCountLabel,
  averageEnergyLevel,
  getCheckinMetrics,
  runCheckinCalculationTests,
} from './checkinCalculations';

const FETCH_ERROR_MESSAGE = 'تعذر تحميل المتابعة. حاول مرة أخرى.';
const SAVE_ERROR_MESSAGE = 'تعذر حفظ المتابعة. حاول مرة أخرى.';

export class CheckinServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckinServiceError';
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseWeekStartLocal(weekStart: string): Date {
  const [year, month, day] = weekStart.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

/** بداية الأسبوع (الاثنين) بتوقيت المستخدم المحلي */
export function getCurrentWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysFromMonday);
  monday.setHours(0, 0, 0, 0);
  return formatLocalDate(monday);
}

export function normalizeWeeklyCheckin(row: WeeklyCheckin): WeeklyCheckin {
  const plannedSessions = coerceInt(row.planned_sessions);
  const completedSessions = coerceInt(row.completed_sessions);

  return {
    ...row,
    planned_sessions: plannedSessions,
    completed_sessions: completedSessions,
    adherence_rate: resolveAdherenceRate(
      completedSessions,
      plannedSessions,
      row.adherence_rate,
    ),
    energy_level: coerceInt(row.energy_level),
    difficulty_level: coerceInt(row.difficulty_level),
  };
}

const gregorianDateFormatter = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  calendar: 'gregory',
});

const hijriDateFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const weekChartLabelFormatter = new Intl.DateTimeFormat('ar', {
  day: 'numeric',
  month: 'short',
  calendar: 'gregory',
});

/** التاريخ الميلادي الأساسي للأسبوع */
export function formatWeekRangePrimary(weekStart: string): string {
  const start = parseWeekStartLocal(weekStart);
  const end = addDays(start, 6);
  return `الأسبوع الحالي: ${gregorianDateFormatter.format(start)} — ${gregorianDateFormatter.format(end)}`;
}

/** التاريخ الهجري الثانوي مع السنة لكل طرف */
export function formatWeekRangeHijri(weekStart: string): string {
  const start = parseWeekStartLocal(weekStart);
  const end = addDays(start, 6);
  return `${hijriDateFormatter.format(start)} — ${hijriDateFormatter.format(end)}`;
}

export function formatWeekChartLabel(weekStart: string): string {
  return weekChartLabelFormatter.format(parseWeekStartLocal(weekStart));
}

/** @deprecated استخدم formatWeekRangePrimary و formatWeekRangeHijri */
export function formatWeekRange(weekStart: string): string {
  return formatWeekRangePrimary(weekStart);
}

function buildCheckinRecord(payload: SaveWeeklyCheckinPayload) {
  const plannedSessions = coerceInt(payload.planned_sessions);
  const completedSessions = coerceInt(payload.completed_sessions);

  return {
    planned_sessions: plannedSessions,
    completed_sessions: completedSessions,
    adherence_rate: Number(
      calculateAdherenceRate(completedSessions, plannedSessions).toFixed(4),
    ),
    energy_level: coerceInt(payload.energy_level),
    difficulty_level: coerceInt(payload.difficulty_level),
    notes: payload.notes?.trim() ? payload.notes.trim() : null,
  };
}

function assertSavedRow(
  context: string,
  data: WeeklyCheckin | null,
  error: Parameters<typeof logSupabaseError>[1],
): WeeklyCheckin {
  if (error) {
    logSupabaseError(context, error);
    throw new CheckinServiceError(SAVE_ERROR_MESSAGE);
  }

  if (!data) {
    if (import.meta.env.DEV) {
      console.error(`[Supabase:${context}]`, {
        code: 'NO_ROW_RETURNED',
        message: 'No row returned after write (check table grants and RLS SELECT policy)',
        details: null,
        hint: 'GRANT SELECT, INSERT, UPDATE ON public.weekly_checkins TO authenticated',
      });
    }
    throw new CheckinServiceError(SAVE_ERROR_MESSAGE);
  }

  return normalizeWeeklyCheckin(data);
}

export async function getCurrentWeekCheckin(userId: string): Promise<WeeklyCheckin | null> {
  const weekStart = getCurrentWeekStart();

  const { data, error } = await supabase
    .from('weekly_checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('week_start', weekStart)
    .maybeSingle();

  if (error) {
    logSupabaseError('weekly_checkins.selectCurrentWeek', error);
    throw new CheckinServiceError(FETCH_ERROR_MESSAGE);
  }

  return data ? normalizeWeeklyCheckin(data) : null;
}

export async function getLatestCheckin(userId: string): Promise<WeeklyCheckin | null> {
  const { data, error } = await supabase
    .from('weekly_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logSupabaseError('weekly_checkins.selectLatest', error);
    throw new CheckinServiceError(FETCH_ERROR_MESSAGE);
  }

  return data ? normalizeWeeklyCheckin(data) : null;
}

export async function getRecentCheckins(
  userId: string,
  limit = 8,
): Promise<WeeklyCheckin[]> {
  const { data, error } = await supabase
    .from('weekly_checkins')
    .select('*')
    .eq('user_id', userId)
    .order('week_start', { ascending: false })
    .limit(limit);

  if (error) {
    logSupabaseError('weekly_checkins.selectRecent', error);
    throw new CheckinServiceError(FETCH_ERROR_MESSAGE);
  }

  return (data ?? [])
    .map(normalizeWeeklyCheckin)
    .sort((a, b) => a.week_start.localeCompare(b.week_start));
}

async function updateExistingCheckin(
  userId: string,
  checkinId: string,
  payload: SaveWeeklyCheckinPayload,
): Promise<WeeklyCheckin> {
  const record = buildCheckinRecord(payload);

  const { data, error } = await supabase
    .from('weekly_checkins')
    .update(record)
    .eq('id', checkinId)
    .eq('user_id', userId)
    .select('*')
    .single();

  return assertSavedRow('weekly_checkins.update', data, error);
}

async function insertNewCheckin(payload: SaveWeeklyCheckinPayload): Promise<WeeklyCheckin> {
  const weekStart = getCurrentWeekStart();
  const record = buildCheckinRecord(payload);

  const { data, error } = await supabase
    .from('weekly_checkins')
    .insert({
      user_id: payload.userId,
      week_start: weekStart,
      ...record,
    })
    .select('*')
    .single();

  if (error?.code === '23505') {
    const existing = await getCurrentWeekCheckin(payload.userId);
    if (existing) {
      return updateExistingCheckin(payload.userId, existing.id, payload);
    }
  }

  return assertSavedRow('weekly_checkins.insert', data, error);
}

export async function saveWeeklyCheckin(payload: SaveWeeklyCheckinPayload): Promise<WeeklyCheckin> {
  const existing = await getCurrentWeekCheckin(payload.userId);

  if (existing) {
    return updateExistingCheckin(payload.userId, existing.id, payload);
  }

  return insertNewCheckin(payload);
}

export { FETCH_ERROR_MESSAGE, SAVE_ERROR_MESSAGE };
