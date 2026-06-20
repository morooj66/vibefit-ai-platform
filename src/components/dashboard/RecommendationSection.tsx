import { Card } from '../ui/Card';
import {
  getGenerationTypeLabel,
  type ExerciseItem,
  type Recommendation,
  type WeeklyPlanItem,
} from '../../types/recommendation';

function parseWeeklyPlan(plan: Recommendation['weekly_plan']): WeeklyPlanItem[] {
  if (!Array.isArray(plan)) return [];
  return plan as WeeklyPlanItem[];
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function GenerationBadge({ generationType }: { generationType: string }) {
  const isAi = generationType === 'ai';

  return (
    <span
      className={[
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        isAi ? 'bg-primary-100 text-primary-700' : 'bg-amber-100 text-amber-800',
      ].join(' ')}
    >
      {getGenerationTypeLabel(generationType)}
    </span>
  );
}

function ExerciseList({ exercises }: { exercises: ExerciseItem[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {exercises.map((exercise) => (
        <li
          key={`${exercise.name}-${exercise.sets}-${exercise.repetitions}`}
          className="rounded-md border border-neutral-100 bg-neutral-0 p-2 text-xs"
        >
          <p className="font-medium text-neutral-800">{exercise.name}</p>
          <p className="mt-1 text-neutral-600">
            {exercise.sets} مجموعات · {exercise.repetitions} تكرار · راحة{' '}
            {exercise.rest_seconds} ث
          </p>
          {exercise.notes && <p className="mt-1 text-neutral-500">{exercise.notes}</p>}
        </li>
      ))}
    </ul>
  );
}

interface RecommendationSectionProps {
  recommendation: Recommendation;
}

export function RecommendationSection({ recommendation }: RecommendationSectionProps) {
  const weeklyPlan = parseWeeklyPlan(recommendation.weekly_plan);
  const nutritionNotes = parseStringArray(recommendation.nutrition_notes);
  const safetyNotes = parseStringArray(recommendation.safety_notes);
  const isAi = recommendation.generation_type === 'ai';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">التوصية</h2>
          <GenerationBadge generationType={recommendation.generation_type} />
        </div>
        <p className="text-xs text-neutral-500">
          {formatCreatedAt(recommendation.created_at)}
        </p>
      </div>

      <Card elevated className="p-4">
        <h3 className="text-sm font-semibold">الملخص</h3>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{recommendation.summary}</p>
      </Card>

      <Card elevated className="p-4">
        <h3 className="text-sm font-semibold">الخطة الأسبوعية</h3>
        <div className="mt-3 space-y-2">
          {weeklyPlan.map((item, index) => (
            <details
              key={`${item.day}-${index}`}
              open={index === 0}
              className="group rounded-lg border border-neutral-100 bg-neutral-50 open:bg-neutral-0"
            >
              <summary className="cursor-pointer list-none p-3 [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {item.day} — {item.focus}
                  </p>
                  <span className="text-xs text-neutral-500">
                    {item.duration_minutes} دقيقة
                  </span>
                </div>
                <p className="mt-1 text-xs text-neutral-500 group-open:hidden line-clamp-1">
                  {item.notes}
                </p>
              </summary>
              <div className="border-t border-neutral-100 px-3 pb-3">
                {item.exercises && item.exercises.length > 0 ? (
                  <ExerciseList exercises={item.exercises} />
                ) : (
                  <p className="mt-2 text-xs text-neutral-500">
                    لا توجد تمارين مفصّلة في هذه التوصية.
                  </p>
                )}
                {item.notes && (
                  <p className="mt-2 text-xs text-neutral-600">{item.notes}</p>
                )}
              </div>
            </details>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold">ملاحظات التغذية</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-600">
            {nutritionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold">ملاحظات السلامة</h3>
          <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-neutral-600">
            {safetyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        className={[
          'p-3',
          isAi ? 'border border-primary-200 bg-primary-50' : 'border border-amber-200 bg-amber-50',
        ].join(' ')}
      >
        <p className={`text-xs ${isAi ? 'text-primary-900' : 'text-amber-900'}`}>
          {isAi
            ? 'هذه توصية ذكية عامة وليست تشخيصًا طبيًا أو بديلًا عن المختص.'
            : 'هذه توصية تجريبية عامة وليست تشخيصًا طبيًا أو بديلًا عن المختص.'}
        </p>
      </Card>
    </div>
  );
}
