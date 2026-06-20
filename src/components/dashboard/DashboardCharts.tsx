import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  formatWeekChartLabel,
  getCheckinMetrics,
} from '../../services/checkins/checkinService';
import type { WeeklyCheckin } from '../../types/checkin';

interface DashboardChartsProps {
  checkins: WeeklyCheckin[];
}

interface ChartPoint {
  week: string;
  adherencePercent: number;
  planned: number;
  completed: number;
  energy: number;
  difficulty: number;
}

function buildChartData(checkins: WeeklyCheckin[]): ChartPoint[] {
  return checkins.map((checkin) => {
    const metrics = getCheckinMetrics(checkin);
    return {
      week: formatWeekChartLabel(checkin.week_start),
      adherencePercent: metrics.adherencePercent,
      planned: metrics.plannedSessions,
      completed: metrics.completedSessions,
      energy: metrics.energyLevel,
      difficulty: metrics.difficultyLevel,
    };
  });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const labels: Record<string, string> = {
    adherencePercent: 'نسبة الالتزام',
    planned: 'المخطط',
    completed: 'المكتمل',
    energy: 'الطاقة',
    difficulty: 'الصعوبة',
  };

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-0 px-3 py-2 text-xs shadow-sm">
      <p className="mb-1 font-medium text-neutral-700">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="text-neutral-600">
          {labels[entry.name ?? ''] ?? entry.name}:{' '}
          {entry.name === 'adherencePercent' ? `${entry.value}%` : entry.value}
        </p>
      ))}
    </div>
  );
}

export function DashboardAnalyticsEmptyState() {
  return (
    <Card className="p-4 text-center">
      <h2 className="text-base font-semibold">تحليلات المتابعة</h2>
      <p className="mt-2 text-sm text-neutral-600">
        لا توجد متابعات مسجّلة بعد. سجّل متابعتك الأسبوعية لعرض التحليلات.
      </p>
      <Link to="/check-in" className="mt-3 inline-block">
        <Button size="sm">سجّل متابعتك</Button>
      </Link>
    </Card>
  );
}

export function DashboardCharts({ checkins }: DashboardChartsProps) {
  if (checkins.length === 0) {
    return <DashboardAnalyticsEmptyState />;
  }

  const chartData = buildChartData(checkins);
  const showTrendNote = checkins.length === 1;

  return (
    <div className="grid gap-3 lg:grid-cols-2" dir="rtl">
      <Card className="p-4 lg:col-span-2">
        <h3 className="text-sm font-semibold text-neutral-800">اتجاه الالتزام</h3>
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
              <Tooltip content={<ChartTooltip />} />
              <Line
                type="monotone"
                dataKey="adherencePercent"
                name="adherencePercent"
                stroke="#10B99A"
                strokeWidth={2}
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {showTrendNote && (
          <p className="mt-2 text-xs text-neutral-500">
            سجّل متابعة أسبوع آخر لعرض اتجاه التقدم.
          </p>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-neutral-800">المخطط مقابل المكتمل</h3>
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} domain={[0, 7]} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value) =>
                  value === 'planned' ? 'المخطط' : value === 'completed' ? 'المكتمل' : value
                }
              />
              <Bar dataKey="planned" name="planned" fill="#D1D5DB" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" name="completed" fill="#10B99A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-neutral-800">الطاقة والصعوبة</h3>
        <div className="mt-3 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis domain={[1, 5]} allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                formatter={(value) =>
                  value === 'energy' ? 'الطاقة' : value === 'difficulty' ? 'الصعوبة' : value
                }
              />
              <Line
                type="monotone"
                dataKey="energy"
                name="energy"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="difficulty"
                name="difficulty"
                stroke="#6B7280"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}
