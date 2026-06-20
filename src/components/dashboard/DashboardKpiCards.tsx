import { Card } from '../ui/Card';
import {
  averageEnergyLevel,
  formatRating,
  formatSessionsLabel,
  formatWeeksCountLabel,
  getCheckinMetrics,
} from '../../services/checkins/checkinService';
import type { WeeklyCheckin } from '../../types/checkin';

interface DashboardKpiCardsProps {
  currentCheckin: WeeklyCheckin | null;
  recentCheckins: WeeklyCheckin[];
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-neutral-800">{value}</p>
    </Card>
  );
}

export function DashboardKpiCards({ currentCheckin, recentCheckins }: DashboardKpiCardsProps) {
  const currentMetrics = currentCheckin ? getCheckinMetrics(currentCheckin) : null;
  const avgEnergy = averageEnergyLevel(recentCheckins);

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiCard
        label="نسبة الالتزام"
        value={currentMetrics ? `${currentMetrics.adherencePercent}%` : '—'}
      />
      <KpiCard
        label="الجلسات المكتملة من المخططة"
        value={
          currentMetrics
            ? formatSessionsLabel(
                currentMetrics.completedSessions,
                currentMetrics.plannedSessions,
              )
            : '—'
        }
      />
      <KpiCard
        label="متوسط الطاقة"
        value={avgEnergy !== null ? formatRating(avgEnergy, 5) : '—'}
      />
      <KpiCard
        label="أسابيع مسجّلة"
        value={formatWeeksCountLabel(recentCheckins.length)}
      />
    </div>
  );
}
