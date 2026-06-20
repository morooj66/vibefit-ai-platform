import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import type { Assessment } from '../../types/recommendation';

const GOAL_LABELS: Record<string, string> = {
  weight_loss: 'خسارة الوزن',
  muscle_gain: 'بناء العضلات',
  general_fitness: 'لياقة عامة',
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: 'مبتدئ',
  intermediate: 'متوسط',
  advanced: 'متقدم',
};

interface AssessmentCompactCardProps {
  assessment: Assessment;
}

export function AssessmentCompactCard({ assessment }: AssessmentCompactCardProps) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">ملخص التقييم</h2>
        <Link to="/assessment">
          <Button variant="ghost" size="sm">
            تحديث
          </Button>
        </Link>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-500">الهدف</dt>
          <dd className="font-medium">
            {GOAL_LABELS[assessment.primary_goal] ?? assessment.primary_goal}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">مستوى الخبرة</dt>
          <dd className="font-medium">
            {EXPERIENCE_LABELS[assessment.experience_level] ?? assessment.experience_level}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">أيام التمرين</dt>
          <dd className="font-medium">{assessment.training_days_per_week} أيام/أسبوع</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-500">مدة الجلسة</dt>
          <dd className="font-medium">{assessment.session_duration_minutes} دقيقة</dd>
        </div>
      </dl>
    </Card>
  );
}
