export function calculateAdherenceRate(completedSessions: number, plannedSessions: number): number {
  if (plannedSessions <= 0) return 0;
  return Math.min(completedSessions / plannedSessions, 1);
}

export function formatAdherencePercent(adherenceRate: number): number {
  return Math.round(adherenceRate * 100);
}

export function coerceInt(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

export function coerceRate(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Number.NaN;
  if (parsed > 1) {
    return Math.min(parsed / 100, 1);
  }
  return parsed;
}

/** يتحقق من adherence_rate المخزن، ويعيد حسابًا من الجلسات عند عدم صلاحيته */
export function resolveAdherenceRate(
  completedSessions: number,
  plannedSessions: number,
  storedRate: unknown,
): number {
  const calculated = calculateAdherenceRate(completedSessions, plannedSessions);
  const stored = coerceRate(storedRate);

  if (
    Number.isFinite(stored) &&
    stored >= 0 &&
    stored <= 1 &&
    Math.abs(stored - calculated) <= 0.0001
  ) {
    return stored;
  }

  return calculated;
}

export function getCheckinMetrics(checkin: {
  planned_sessions: unknown;
  completed_sessions: unknown;
  adherence_rate: unknown;
  energy_level: unknown;
  difficulty_level: unknown;
}) {
  const plannedSessions = coerceInt(checkin.planned_sessions);
  const completedSessions = coerceInt(checkin.completed_sessions);
  const adherenceRate = resolveAdherenceRate(
    completedSessions,
    plannedSessions,
    checkin.adherence_rate,
  );

  return {
    plannedSessions,
    completedSessions,
    adherenceRate,
    adherencePercent: formatAdherencePercent(adherenceRate),
    energyLevel: coerceInt(checkin.energy_level),
    difficultyLevel: coerceInt(checkin.difficulty_level),
  };
}

export function formatRating(value: number, max = 5): string {
  return `${value} من ${max}`;
}

export function formatSessionsLabel(completed: number, planned: number): string {
  return `${completed} من ${planned} جلسات`;
}

export function formatWeeksCountLabel(count: number): string {
  if (count === 1) return 'أسبوع واحد';
  if (count === 2) return 'أسبوعان';
  if (count >= 3 && count <= 10) return `${count} أسابيع`;
  return `${count} أسبوعًا`;
}

export function averageEnergyLevel(
  checkins: Array<{ energy_level: unknown }>,
): number | null {
  if (checkins.length === 0) return null;
  const total = checkins.reduce((sum, item) => sum + coerceInt(item.energy_level), 0);
  return Math.round(total / checkins.length);
}

/** اختبارات بسيطة للدوال النقية */
export function runCheckinCalculationTests(): boolean {
  const cases: Array<{ completed: number; planned: number; expected: number }> = [
    { completed: 3, planned: 4, expected: 75 },
    { completed: 4, planned: 4, expected: 100 },
    { completed: 0, planned: 4, expected: 0 },
  ];

  for (const testCase of cases) {
    const rate = calculateAdherenceRate(testCase.completed, testCase.planned);
    const percent = formatAdherencePercent(rate);
    if (percent !== testCase.expected) {
      throw new Error(
        `Expected ${testCase.expected}% for ${testCase.completed}/${testCase.planned}, got ${percent}%`,
      );
    }
  }

  if (calculateAdherenceRate(5, 4) !== 1) {
    throw new Error('completed_sessions must not exceed planned_sessions ratio above 1');
  }

  const resolved = resolveAdherenceRate(3, 4, 1);
  if (resolved !== 0.75) {
    throw new Error('resolveAdherenceRate should recalculate invalid stored rate');
  }

  return true;
}
