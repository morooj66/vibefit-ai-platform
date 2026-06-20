import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import { FormField } from '../components/ui/FormField';
import {
  CheckinServiceError,
  formatWeekRangeHijri,
  formatWeekRangePrimary,
  getCurrentWeekCheckin,
  getCurrentWeekStart,
  saveWeeklyCheckin,
} from '../services/checkins/checkinService';

interface CheckInFormState {
  planned_sessions: string;
  completed_sessions: string;
  energy_level: string;
  difficulty_level: string;
  self_reported_commitment: string;
  notes: string;
}

const defaultFormState: CheckInFormState = {
  planned_sessions: '',
  completed_sessions: '',
  energy_level: '',
  difficulty_level: '',
  self_reported_commitment: '',
  notes: '',
};

const checkinFormSchema = z
  .object({
    planned_sessions: z
      .string()
      .min(1, 'يرجى إدخال عدد أيام التمرين المخططة')
      .transform((value) => Number(value))
      .pipe(
        z
          .number({ error: 'يرجى إدخال رقم صالح' })
          .min(1, 'عدد الأيام المخططة يجب أن يكون بين 1 و 7')
          .max(7, 'عدد الأيام المخططة يجب أن يكون بين 1 و 7'),
      ),
    completed_sessions: z
      .string()
      .min(1, 'يرجى إدخال عدد أيام التمرين الفعلية')
      .transform((value) => Number(value))
      .pipe(
        z
          .number({ error: 'يرجى إدخال رقم صالح' })
          .min(0, 'عدد الأيام الفعلية لا يمكن أن يكون سالبًا'),
      ),
    energy_level: z
      .string()
      .min(1, 'يرجى اختيار مستوى الطاقة')
      .transform((value) => Number(value))
      .pipe(
        z
          .number({ error: 'يرجى اختيار مستوى الطاقة' })
          .min(1, 'مستوى الطاقة يجب أن يكون بين 1 و 5')
          .max(5, 'مستوى الطاقة يجب أن يكون بين 1 و 5'),
      ),
    difficulty_level: z
      .string()
      .min(1, 'يرجى اختيار مستوى الصعوبة')
      .transform((value) => Number(value))
      .pipe(
        z
          .number({ error: 'يرجى اختيار مستوى الصعوبة' })
          .min(1, 'مستوى الصعوبة يجب أن يكون بين 1 و 5')
          .max(5, 'مستوى الصعوبة يجب أن يكون بين 1 و 5'),
      ),
    notes: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? ''),
  })
  .superRefine((data, ctx) => {
    if (data.completed_sessions > data.planned_sessions) {
      ctx.addIssue({
        code: 'custom',
        message: 'عدد الأيام الفعلية لا يمكن أن يتجاوز المخطط',
        path: ['completed_sessions'],
      });
    }
  });

type FieldErrors = Partial<Record<keyof CheckInFormState, string>>;

function ScaleField({
  id,
  label,
  value,
  onChange,
  error,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={[
          'h-11 w-full rounded-md border bg-neutral-0 px-4 text-base text-neutral-800',
          'focus:border-primary-500 focus:outline-none focus:shadow-focus',
          error ? 'border-error-500' : 'border-neutral-300',
        ].join(' ')}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      >
        <option value="">اختر…</option>
        {[1, 2, 3, 4, 5].map((level) => (
          <option key={level} value={String(level)}>
            {level}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-error-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CheckInPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const savingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [formError, setFormError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [form, setForm] = useState<CheckInFormState>(defaultFormState);

  const userId = session?.user?.id;
  const weekStart = getCurrentWeekStart();
  const weekPrimaryLabel = formatWeekRangePrimary(weekStart);
  const weekHijriLabel = formatWeekRangeHijri(weekStart);

  useEffect(() => {
    if (!userId) return;

    const activeUserId = userId;
    let cancelled = false;

    async function loadCheckin() {
      setLoading(true);
      setFormError('');

      try {
        const existing = await getCurrentWeekCheckin(activeUserId);

        if (cancelled) return;

        if (existing) {
          setIsEditingExisting(true);
          setForm({
            planned_sessions: String(existing.planned_sessions),
            completed_sessions: String(existing.completed_sessions),
            energy_level: String(existing.energy_level),
            difficulty_level: String(existing.difficulty_level),
            self_reported_commitment: '',
            notes: existing.notes ?? '',
          });
        } else {
          setIsEditingExisting(false);
          setForm(defaultFormState);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof CheckinServiceError
              ? err.message
              : 'تعذر تحميل المتابعة. حاول مرة أخرى.';
          setFormError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadCheckin();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const updateField = (field: keyof CheckInFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
    setFormError('');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!userId || savingRef.current) return;

    setFieldErrors({});
    setFormError('');

    const result = checkinFormSchema.safeParse(form);

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === 'string' && !errors[field as keyof CheckInFormState]) {
          errors[field as keyof CheckInFormState] = issue.message;
        }
      }
      setFieldErrors(errors);
      return;
    }

    savingRef.current = true;
    setSaving(true);

    try {
      await saveWeeklyCheckin({
        userId,
        planned_sessions: result.data.planned_sessions,
        completed_sessions: result.data.completed_sessions,
        energy_level: result.data.energy_level,
        difficulty_level: result.data.difficulty_level,
        notes: result.data.notes || null,
      });

      navigate('/dashboard', { replace: true });
    } catch (err) {
      const message =
        err instanceof CheckinServiceError
          ? err.message
          : 'تعذر حفظ المتابعة. حاول مرة أخرى.';
      setFormError(message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Container narrow className="py-8 md:py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-neutral-200" />
          <Card>
            <div className="space-y-4">
              <div className="h-11 rounded bg-neutral-100" />
              <div className="h-11 rounded bg-neutral-100" />
              <div className="h-11 rounded bg-neutral-100" />
            </div>
          </Card>
        </div>
        <p className="mt-6 text-center text-sm text-neutral-500">جاري تحميل المتابعة…</p>
      </Container>
    );
  }

  return (
    <Container narrow className="py-8 md:py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المتابعة الأسبوعية</h1>
          <p className="mt-2 text-sm text-neutral-500">
            {isEditingExisting
              ? 'يمكنك تعديل متابعة هذا الأسبوع وحفظ التغييرات.'
              : 'سجّل التزامك وتقدّمك لهذا الأسبوع.'}
          </p>
        </div>
        <div className="text-end">
          <p className="text-xs font-medium text-primary-700">{weekPrimaryLabel}</p>
          <p className="mt-0.5 text-[10px] text-neutral-500">{weekHijriLabel}</p>
        </div>
      </div>

      {formError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {formError}
        </div>
      )}

      <Card elevated>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <FormField
            id="planned_sessions"
            label="عدد أيام التمرين المخطط لها"
            type="number"
            value={form.planned_sessions}
            onChange={(value) => updateField('planned_sessions', value)}
            error={fieldErrors.planned_sessions}
            hint="من 1 إلى 7 أيام"
            required
            ltr
          />

          <FormField
            id="completed_sessions"
            label="عدد أيام التمرين الفعلية"
            type="number"
            value={form.completed_sessions}
            onChange={(value) => updateField('completed_sessions', value)}
            error={fieldErrors.completed_sessions}
            hint={`من 0 إلى ${form.planned_sessions || '7'}`}
            required
            ltr
          />

          <ScaleField
            id="self_reported_commitment"
            label="الالتزام بالخطة (1–5)"
            value={form.self_reported_commitment}
            onChange={(value) => updateField('self_reported_commitment', value)}
            hint="تقييم ذاتي فقط — لا يُحفظ في قاعدة البيانات في هذه المرحلة"
          />

          <ScaleField
            id="energy_level"
            label="مستوى الطاقة (1–5)"
            value={form.energy_level}
            onChange={(value) => updateField('energy_level', value)}
            error={fieldErrors.energy_level}
          />

          <ScaleField
            id="difficulty_level"
            label="مستوى الصعوبة (1–5)"
            value={form.difficulty_level}
            onChange={(value) => updateField('difficulty_level', value)}
            error={fieldErrors.difficulty_level}
          />

          <FormField
            id="notes"
            label="ملاحظات"
            value={form.notes}
            onChange={(value) => updateField('notes', value)}
            error={fieldErrors.notes}
            optional
          />

          <Button type="submit" fullWidth disabled={saving}>
            {saving
              ? 'جاري الحفظ…'
              : isEditingExisting
                ? 'حفظ التعديلات'
                : 'إرسال المتابعة'}
          </Button>
        </form>
      </Card>
    </Container>
  );
}
