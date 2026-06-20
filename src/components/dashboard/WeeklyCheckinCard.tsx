import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  formatRating,
  formatSessionsLabel,
  formatWeekRangeHijri,
  formatWeekRangePrimary,
  getCheckinMetrics,
} from '../../services/checkins/checkinService';
import type { WeeklyCheckin } from '../../types/checkin';

interface WeeklyCheckinCardProps {
  checkin: WeeklyCheckin | null;
}

export function WeeklyCheckinCard({ checkin }: WeeklyCheckinCardProps) {
  if (!checkin) {
    return (
      <Card>
        <h2 className="text-base font-semibold">متابعة هذا الأسبوع</h2>
        <p className="mt-2 text-sm text-neutral-600">لم تسجل متابعة هذا الأسبوع</p>
        <Link to="/check-in" className="mt-3 inline-block">
          <Button size="sm">سجل المتابعة</Button>
        </Link>
      </Card>
    );
  }

  const metrics = getCheckinMetrics(checkin);

  return (
    <Card elevated className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-base font-semibold">متابعة هذا الأسبوع</h2>
        <div className="text-start text-xs text-neutral-500">
          <p>{formatWeekRangePrimary(checkin.week_start)}</p>
          <p className="mt-0.5 text-[10px]">{formatWeekRangeHijri(checkin.week_start)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div
          className="relative mx-auto flex h-20 w-20 shrink-0 items-center justify-center sm:mx-0"
          aria-hidden
        >
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="3"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="#10B99A"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${metrics.adherencePercent} 100`}
            />
          </svg>
          <span className="absolute text-sm font-bold text-primary-700">
            {metrics.adherencePercent}%
          </span>
        </div>

        <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-neutral-500">الجلسات</dt>
            <dd className="font-medium">
              {formatSessionsLabel(metrics.completedSessions, metrics.plannedSessions)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">نسبة الالتزام</dt>
            <dd className="font-medium">{metrics.adherencePercent}%</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">مستوى الطاقة</dt>
            <dd className="font-medium">{formatRating(metrics.energyLevel, 5)}</dd>
          </div>
          <div>
            <dt className="text-xs text-neutral-500">مستوى الصعوبة</dt>
            <dd className="font-medium">{formatRating(metrics.difficultyLevel, 5)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-primary-500 transition-all"
          style={{ width: `${metrics.adherencePercent}%` }}
        />
      </div>

      <Link to="/check-in" className="mt-3 inline-block">
        <Button variant="secondary" size="sm">
          تحديث المتابعة
        </Button>
      </Link>
    </Card>
  );
}
