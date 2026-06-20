import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import { FormField, FormMessage } from '../components/ui/FormField';
import {
  ensureMockRecommendation,
  generateAiRecommendation,
} from '../services/recommendations/recommendationService';
import type { Assessment } from '../types/recommendation';
import { supabase } from '../lib/supabase';
import { logSupabaseError } from '../lib/supabaseDebug';

const TOTAL_STEPS = 4;

const STEP_TITLES = [
  'البيانات الأساسية',
  'الهدف الرياضي',
  'نمط التمرين',
  'الحالة الصحية والملاحظات',
];

export interface AssessmentFormData {
  age: string;
  gender: string;
  height: string;
  weight: string;
  goal: string;
  experienceLevel: string;
  activityLevel: string;
  trainingDaysPerWeek: string;
  sessionDuration: string;
  trainingLocation: string;
  equipment: string;
  constraints: string;
  notes: string;
}

const defaultValues: AssessmentFormData = {
  age: '',
  gender: '',
  height: '',
  weight: '',
  goal: '',
  experienceLevel: '',
  activityLevel: '',
  trainingDaysPerWeek: '',
  sessionDuration: '',
  trainingLocation: '',
  equipment: '',
  constraints: '',
  notes: '',
};

const STEP_FIELDS: Record<number, (keyof AssessmentFormData)[]> = {
  1: ['age', 'height', 'weight'],
  2: ['goal', 'experienceLevel', 'activityLevel'],
  3: ['trainingDaysPerWeek', 'sessionDuration', 'trainingLocation', 'equipment'],
  4: [],
};

const assessmentFormSchema = z.object({
  age: z
    .string()
    .min(1, 'يرجى إدخال العمر')
    .transform((value) => Number(value))
    .pipe(
      z
        .number({ error: 'يرجى إدخال عمر صالح' })
        .min(16, 'العمر يجب أن يكون بين 16 و 80')
        .max(80, 'العمر يجب أن يكون بين 16 و 80'),
    ),
  gender: z
    .string()
    .optional()
    .transform((value) => value?.trim() || ''),
  height: z
    .string()
    .min(1, 'يرجى إدخال الطول')
    .transform((value) => Number(value))
    .pipe(
      z
        .number({ error: 'يرجى إدخال طول صالح' })
        .min(100, 'الطول يجب أن يكون بين 100 و 250 سم')
        .max(250, 'الطول يجب أن يكون بين 100 و 250 سم'),
    ),
  weight: z
    .string()
    .min(1, 'يرجى إدخال الوزن')
    .transform((value) => Number(value))
    .pipe(
      z
        .number({ error: 'يرجى إدخال وزن صالح' })
        .min(30, 'الوزن يجب أن يكون بين 30 و 300 كغ')
        .max(300, 'الوزن يجب أن يكون بين 30 و 300 كغ'),
    ),
  goal: z.enum(['weight_loss', 'muscle_gain', 'general_fitness'], {
    error: 'يرجى اختيار الهدف الرياضي',
  }),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced'], {
    error: 'يرجى اختيار مستوى الخبرة',
  }),
  activityLevel: z.enum(['low', 'medium', 'active'], {
    error: 'يرجى اختيار مستوى النشاط اليومي',
  }),
  trainingDaysPerWeek: z
    .string()
    .min(1, 'يرجى إدخال عدد أيام التمرين')
    .transform((value) => Number(value))
    .pipe(
      z
        .number({ error: 'يرجى إدخال رقم صالح' })
        .min(1, 'عدد الأيام يجب أن يكون بين 1 و 7')
        .max(7, 'عدد الأيام يجب أن يكون بين 1 و 7'),
    ),
  sessionDuration: z
    .string()
    .min(1, 'يرجى اختيار مدة التمرين')
    .transform((value) => Number(value))
    .pipe(
      z
        .number({ error: 'يرجى اختيار مدة التمرين' })
        .refine((value) => [20, 30, 45, 60].includes(value), {
          message: 'يرجى اختيار مدة التمرين',
        }),
    ),
  trainingLocation: z.enum(['home', 'gym'], {
    error: 'يرجى اختيار مكان التمرين',
  }),
  equipment: z.string().trim().min(1, 'يرجى ذكر المعدات المتاحة'),
  constraints: z.string().optional().transform((value) => value?.trim() || ''),
  notes: z.string().optional().transform((value) => value?.trim() || ''),
});

type ParsedAssessmentData = z.infer<typeof assessmentFormSchema>;

function mapToAssessmentInsert(data: ParsedAssessmentData, userId: string) {
  return {
    user_id: userId,
    age: data.age,
    gender: data.gender || null,
    height_cm: data.height,
    weight_kg: data.weight,
    activity_level: data.activityLevel,
    primary_goal: data.goal,
    experience_level: data.experienceLevel,
    training_days_per_week: data.trainingDaysPerWeek,
    session_duration_minutes: data.sessionDuration,
    training_location: data.trainingLocation,
    equipment: data.equipment,
    constraints_notes: data.constraints || null,
    notes: data.notes || null,
  };
}

async function logAssessmentActivity(userId: string) {
  const { error } = await supabase.from('activity_events').insert({
    user_id: userId,
    event_name: 'assessment_submitted',
  });

  if (error) {
    // الجدول أو العمود قد لا يكون موجودًا — تجاهل بدون إيقاف التدفق
  }
}

const SAVE_ERROR_MESSAGE = 'حدث خطأ أثناء حفظ البيانات';
const SAVE_SUCCESS_MESSAGE = 'تم حفظ التقييم بنجاح';
const PREPARING_RECOMMENDATION_MESSAGE = 'جاري إعداد توصيتك الذكية…';
const RECOMMENDATION_PARTIAL_MESSAGE =
  'تم حفظ تقييمك، لكن تعذر إنشاء التوصية الذكية.';
const MOCK_CONSENT_LABEL = 'استخدام توصية تجريبية مؤقتة؟';

const GOAL_OPTIONS = [
  { value: 'weight_loss', label: 'خسارة وزن' },
  { value: 'muscle_gain', label: 'بناء عضل' },
  { value: 'general_fitness', label: 'لياقة عامة' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'مبتدئ' },
  { value: 'intermediate', label: 'متوسط' },
  { value: 'advanced', label: 'متقدم' },
];

const ACTIVITY_OPTIONS = [
  { value: 'low', label: 'منخفض' },
  { value: 'medium', label: 'متوسط' },
  { value: 'active', label: 'نشط' },
];

const DURATION_OPTIONS = [
  { value: '20', label: '20 دقيقة' },
  { value: '30', label: '30 دقيقة' },
  { value: '45', label: '45 دقيقة' },
  { value: '60', label: '60 دقيقة' },
];

const LOCATION_OPTIONS = [
  { value: 'home', label: 'منزل' },
  { value: 'gym', label: 'نادي' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'ذكر' },
  { value: 'female', label: 'أنثى' },
  { value: 'prefer_not_to_say', label: 'أفضل عدم الإفصاح' },
];

const SUMMARY_LABELS: Record<keyof AssessmentFormData, string> = {
  age: 'العمر',
  gender: 'الجنس',
  height: 'الطول (سم)',
  weight: 'الوزن (كغ)',
  goal: 'الهدف',
  experienceLevel: 'مستوى الخبرة',
  activityLevel: 'مستوى النشاط اليومي',
  trainingDaysPerWeek: 'أيام التمرين أسبوعيًا',
  sessionDuration: 'مدة التمرين',
  trainingLocation: 'مكان التمرين',
  equipment: 'المعدات المتاحة',
  constraints: 'إصابات أو قيود',
  notes: 'ملاحظات إضافية',
};

function getOptionLabel(
  options: { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? (value || '—');
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p className="text-sm text-error-700" role="alert">
      {message}
    </p>
  );
}

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  optional?: boolean;
  placeholder?: string;
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
  error,
  required = false,
  optional = false,
  placeholder = 'اختر...',
}: SelectFieldProps) {
  const labelSuffix = optional ? ' (اختياري)' : required ? ' *' : '';

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
        {label}
        {labelSuffix}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={[
          'h-11 w-full rounded-md border bg-neutral-0 px-4 text-base text-neutral-800',
          'focus:outline-none focus:ring-0',
          error
            ? 'border-error-500 focus:border-error-500'
            : 'border-neutral-300 focus:border-primary-500 focus:shadow-focus',
          !value ? 'text-neutral-400' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

interface RadioGroupProps {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  error?: string;
  required?: boolean;
  optional?: boolean;
}

function RadioGroup({
  name,
  label,
  value,
  onChange,
  options,
  error,
  required = false,
  optional = false,
}: RadioGroupProps) {
  const labelSuffix = optional ? ' (اختياري)' : required ? ' *' : '';

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium text-neutral-700">
        {label}
        {labelSuffix}
      </legend>
      <div className="grid gap-3 sm:grid-cols-3">
        {options.map((option) => {
          const selected = value === option.value;

          return (
            <label
              key={option.value}
              className={[
                'flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-4 py-3 text-sm font-medium transition-colors',
                selected
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-neutral-200 bg-neutral-0 text-neutral-700 hover:border-primary-300',
              ].join(' ')}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}

function ProgressBar({ step, showSummary }: { step: number; showSummary: boolean }) {
  const progress = showSummary ? 100 : (step / TOTAL_STEPS) * 100;

  return (
    <div className="mb-8">
      <div className="mb-2 flex items-center justify-between text-sm text-neutral-600">
        <span>
          {showSummary ? 'الملخص' : `الخطوة ${step} من ${TOTAL_STEPS}`}
        </span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
        <div
          className="h-full rounded-full bg-primary-500 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function SummaryView({ data }: { data: AssessmentFormData }) {
  const summaryItems: { label: string; value: string }[] = [
    { label: SUMMARY_LABELS.age, value: data.age ? `${data.age} سنة` : '—' },
    {
      label: SUMMARY_LABELS.gender,
      value: data.gender
        ? getOptionLabel(GENDER_OPTIONS, data.gender)
        : '—',
    },
    {
      label: SUMMARY_LABELS.height,
      value: data.height ? `${data.height} سم` : '—',
    },
    {
      label: SUMMARY_LABELS.weight,
      value: data.weight ? `${data.weight} كغ` : '—',
    },
    {
      label: SUMMARY_LABELS.goal,
      value: getOptionLabel(GOAL_OPTIONS, data.goal),
    },
    {
      label: SUMMARY_LABELS.experienceLevel,
      value: getOptionLabel(EXPERIENCE_OPTIONS, data.experienceLevel),
    },
    {
      label: SUMMARY_LABELS.activityLevel,
      value: getOptionLabel(ACTIVITY_OPTIONS, data.activityLevel),
    },
    {
      label: SUMMARY_LABELS.trainingDaysPerWeek,
      value: data.trainingDaysPerWeek
        ? `${data.trainingDaysPerWeek} أيام`
        : '—',
    },
    {
      label: SUMMARY_LABELS.sessionDuration,
      value: getOptionLabel(DURATION_OPTIONS, data.sessionDuration),
    },
    {
      label: SUMMARY_LABELS.trainingLocation,
      value: getOptionLabel(LOCATION_OPTIONS, data.trainingLocation),
    },
    {
      label: SUMMARY_LABELS.equipment,
      value: data.equipment || '—',
    },
    {
      label: SUMMARY_LABELS.constraints,
      value: data.constraints || '—',
    },
    {
      label: SUMMARY_LABELS.notes,
      value: data.notes || '—',
    },
  ];

  return (
    <Card elevated>
      <h2 className="text-lg font-semibold text-neutral-800">ملخص التقييم</h2>
      <p className="mt-2 text-sm text-neutral-500">
        راجع بياناتك قبل التأكيد. لن يتم حفظ أو إرسال أي بيانات في هذه المرحلة.
      </p>
      <dl className="mt-6 divide-y divide-neutral-100">
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-4"
          >
            <dt className="text-sm font-medium text-neutral-600">{item.label}</dt>
            <dd className="text-sm text-neutral-800 sm:text-end">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function AssessmentPage() {
  const navigate = useNavigate();
  const isSubmittingRef = useRef(false);
  const [step, setStep] = useState(1);
  const [showSummary, setShowSummary] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isPreparingRecommendation, setIsPreparingRecommendation] = useState(false);
  const [recommendationFailed, setRecommendationFailed] = useState(false);
  const [savedAssessment, setSavedAssessment] = useState<Assessment | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const {
    control,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<AssessmentFormData>({
    defaultValues,
    mode: 'onTouched',
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }
      setSessionChecked(true);
    });
  }, [navigate]);

  const goNext = async () => {
    if (isSubmitting) return;

    const fields = STEP_FIELDS[step];
    const isValid = fields.length === 0 ? true : await trigger(fields);

    if (isValid && step < TOTAL_STEPS) {
      setStep((current) => current + 1);
    }
  };

  const goPrevious = () => {
    if (isSubmitting) return;

    if (showSummary) {
      setShowSummary(false);
      return;
    }

    if (step > 1) {
      setStep((current) => current - 1);
    }
  };

  const showSummaryHandler = async () => {
    if (isSubmitting) return;

    const fields = STEP_FIELDS[step];
    const isValid = fields.length === 0 ? true : await trigger(fields);

    if (isValid) {
      setShowSummary(true);
    }
  };

  const generateRecommendation = async (assessment: Assessment) => {
    setIsPreparingRecommendation(true);
    setRecommendationFailed(false);

    try {
      await generateAiRecommendation(assessment.id);
      navigate('/dashboard', { replace: true });
    } catch {
      setRecommendationFailed(true);
      setSaveError(RECOMMENDATION_PARTIAL_MESSAGE);
    } finally {
      setIsPreparingRecommendation(false);
    }
  };

  const handleMockFallback = async () => {
    if (!savedAssessment || isSubmittingRef.current) return;

    isSubmittingRef.current = true;
    setIsPreparingRecommendation(true);
    setRecommendationFailed(false);
    setSaveError('');

    try {
      await ensureMockRecommendation(savedAssessment);
      navigate('/dashboard', { replace: true });
    } catch {
      setSaveError('تعذر حفظ التوصية التجريبية. حاول من لوحة التحكم.');
    } finally {
      isSubmittingRef.current = false;
      setIsPreparingRecommendation(false);
    }
  };

  const onConfirm = handleSubmit(async (data) => {
    if (isSubmittingRef.current) return;

    setSaveError('');
    setSaveSuccess(false);
    setRecommendationFailed(false);
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        navigate('/login', { replace: true });
        return;
      }

      const parsed = assessmentFormSchema.safeParse(data);

      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message ?? SAVE_ERROR_MESSAGE;
        setSaveError(firstError);
        return;
      }

      const { data: savedAssessment, error: insertError } = await supabase
        .from('assessments')
        .insert(mapToAssessmentInsert(parsed.data, user.id))
        .select()
        .single();

      if (insertError || !savedAssessment) {
        logSupabaseError('assessments.insert', insertError);
        setSaveError(SAVE_ERROR_MESSAGE);
        return;
      }

      await logAssessmentActivity(user.id);

      setSavedAssessment(savedAssessment as Assessment);
      setSaveSuccess(true);
      await generateRecommendation(savedAssessment as Assessment);
    } catch {
      setSaveError(SAVE_ERROR_MESSAGE);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  });

  if (!sessionChecked) {
    return null;
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Card>
            <h2 className="mb-6 text-lg font-semibold">{STEP_TITLES[0]}</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Controller
                name="age"
                control={control}
                rules={{
                  required: 'يرجى إدخال العمر',
                  validate: (value) => {
                    const age = Number(value);
                    if (Number.isNaN(age)) return 'يرجى إدخال عمر صالح';
                    if (age < 16 || age > 80) return 'العمر يجب أن يكون بين 16 و 80';
                    return true;
                  },
                }}
                render={({ field, fieldState }) => (
                  <FormField
                    id="age"
                    label="العمر"
                    type="number"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                    ltr
                    placeholder="مثال: 28"
                  />
                )}
              />

              <div className="sm:col-span-2">
                <Controller
                  name="gender"
                  control={control}
                  render={({ field, fieldState }) => (
                    <SelectField
                      id="gender"
                      label="الجنس"
                      value={field.value}
                      onChange={field.onChange}
                      options={GENDER_OPTIONS}
                      error={fieldState.error?.message}
                      optional
                    />
                  )}
                />
              </div>

              <Controller
                name="height"
                control={control}
                rules={{
                  required: 'يرجى إدخال الطول',
                  validate: (value) => {
                    const height = Number(value);
                    if (Number.isNaN(height)) return 'يرجى إدخال طول صالح';
                    if (height < 100 || height > 250) {
                      return 'الطول يجب أن يكون بين 100 و 250 سم';
                    }
                    return true;
                  },
                }}
                render={({ field, fieldState }) => (
                  <FormField
                    id="height"
                    label="الطول (سم)"
                    type="number"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                    ltr
                    placeholder="مثال: 170"
                  />
                )}
              />

              <Controller
                name="weight"
                control={control}
                rules={{
                  required: 'يرجى إدخال الوزن',
                  validate: (value) => {
                    const weight = Number(value);
                    if (Number.isNaN(weight)) return 'يرجى إدخال وزن صالح';
                    if (weight < 30 || weight > 300) {
                      return 'الوزن يجب أن يكون بين 30 و 300 كغ';
                    }
                    return true;
                  },
                }}
                render={({ field, fieldState }) => (
                  <FormField
                    id="weight"
                    label="الوزن (كغ)"
                    type="number"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                    ltr
                    placeholder="مثال: 70"
                  />
                )}
              />
            </div>
          </Card>
        );

      case 2:
        return (
          <Card>
            <h2 className="mb-6 text-lg font-semibold">{STEP_TITLES[1]}</h2>
            <div className="space-y-6">
              <Controller
                name="goal"
                control={control}
                rules={{ required: 'يرجى اختيار الهدف الرياضي' }}
                render={({ field, fieldState }) => (
                  <RadioGroup
                    name="goal"
                    label="الهدف"
                    value={field.value}
                    onChange={field.onChange}
                    options={GOAL_OPTIONS}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />

              <Controller
                name="experienceLevel"
                control={control}
                rules={{ required: 'يرجى اختيار مستوى الخبرة' }}
                render={({ field, fieldState }) => (
                  <RadioGroup
                    name="experienceLevel"
                    label="مستوى الخبرة"
                    value={field.value}
                    onChange={field.onChange}
                    options={EXPERIENCE_OPTIONS}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />

              <Controller
                name="activityLevel"
                control={control}
                rules={{ required: 'يرجى اختيار مستوى النشاط اليومي' }}
                render={({ field, fieldState }) => (
                  <RadioGroup
                    name="activityLevel"
                    label="مستوى النشاط اليومي"
                    value={field.value}
                    onChange={field.onChange}
                    options={ACTIVITY_OPTIONS}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />
            </div>
          </Card>
        );

      case 3:
        return (
          <Card>
            <h2 className="mb-6 text-lg font-semibold">{STEP_TITLES[2]}</h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Controller
                name="trainingDaysPerWeek"
                control={control}
                rules={{
                  required: 'يرجى إدخال عدد أيام التمرين',
                  validate: (value) => {
                    const days = Number(value);
                    if (Number.isNaN(days)) return 'يرجى إدخال رقم صالح';
                    if (days < 1 || days > 7) {
                      return 'عدد الأيام يجب أن يكون بين 1 و 7';
                    }
                    return true;
                  },
                }}
                render={({ field, fieldState }) => (
                  <FormField
                    id="trainingDaysPerWeek"
                    label="عدد أيام التمرين أسبوعيًا"
                    type="number"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    required
                    ltr
                    placeholder="1–7"
                  />
                )}
              />

              <Controller
                name="sessionDuration"
                control={control}
                rules={{ required: 'يرجى اختيار مدة التمرين' }}
                render={({ field, fieldState }) => (
                  <SelectField
                    id="sessionDuration"
                    label="مدة التمرين"
                    value={field.value}
                    onChange={field.onChange}
                    options={DURATION_OPTIONS}
                    error={fieldState.error?.message}
                    required
                  />
                )}
              />

              <div className="sm:col-span-2">
                <Controller
                  name="trainingLocation"
                  control={control}
                  rules={{ required: 'يرجى اختيار مكان التمرين' }}
                  render={({ field, fieldState }) => (
                    <RadioGroup
                      name="trainingLocation"
                      label="مكان التمرين"
                      value={field.value}
                      onChange={field.onChange}
                      options={LOCATION_OPTIONS}
                      error={fieldState.error?.message}
                      required
                    />
                  )}
                />
              </div>

              <div className="sm:col-span-2">
                <Controller
                  name="equipment"
                  control={control}
                  rules={{ required: 'يرجى ذكر المعدات المتاحة' }}
                  render={({ field, fieldState }) => (
                    <FormField
                      id="equipment"
                      label="المعدات المتاحة"
                      value={field.value}
                      onChange={field.onChange}
                      error={fieldState.error?.message}
                      required
                      placeholder="مثال: دمبل، حبل قفز، بدون معدات"
                    />
                  )}
                />
              </div>
            </div>
          </Card>
        );

      case 4:
        return (
          <Card>
            <h2 className="mb-6 text-lg font-semibold">{STEP_TITLES[3]}</h2>
            <div className="space-y-5">
              <p className="rounded-md border border-info-500/30 bg-info-50 px-4 py-3 text-sm leading-relaxed text-neutral-700">
                المعلومات الصحية هنا للتوعية فقط وليست تشخيصًا أو استشارة طبية.
              </p>

              <Controller
                name="constraints"
                control={control}
                render={({ field, fieldState }) => (
                  <FormField
                    id="constraints"
                    label="إصابات أو قيود"
                    value={field.value}
                    onChange={field.onChange}
                    error={fieldState.error?.message}
                    optional
                    placeholder="اذكر أي قيود عامة (اختياري)"
                  />
                )}
              />

              <Controller
                name="notes"
                control={control}
                render={({ field, fieldState }) => (
                  <div className="space-y-2">
                    <label
                      htmlFor="notes"
                      className="text-sm font-medium text-neutral-700"
                    >
                      ملاحظات إضافية (اختياري)
                    </label>
                    <textarea
                      id="notes"
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                      rows={4}
                      placeholder="أي ملاحظات تود إضافتها"
                      className={[
                        'w-full rounded-md border bg-neutral-0 px-4 py-3 text-base text-neutral-800',
                        'placeholder:text-neutral-400',
                        'focus:border-primary-500 focus:outline-none focus:shadow-focus',
                        fieldState.error
                          ? 'border-error-500'
                          : 'border-neutral-300',
                      ].join(' ')}
                    />
                    <FieldError message={fieldState.error?.message} />
                  </div>
                )}
              />
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <Container className="py-8 md:py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold md:text-3xl">التقييم الرياضي</h1>
        <p className="mt-2 text-sm text-neutral-500">
          أكمل الخطوات التالية للحصول على توصية أولية منظمة
        </p>
      </div>

      <ProgressBar step={step} showSummary={showSummary} />

      {showSummary ? (
        <SummaryView data={getValues()} />
      ) : (
        renderStep()
      )}

      {saveError && (
        <div className="mt-4">
          <FormMessage variant="info">{saveError}</FormMessage>
        </div>
      )}

      {saveSuccess && !recommendationFailed && (
        <div className="mt-4">
          <FormMessage variant="success">
            {isPreparingRecommendation
              ? PREPARING_RECOMMENDATION_MESSAGE
              : SAVE_SUCCESS_MESSAGE}
          </FormMessage>
        </div>
      )}

      {recommendationFailed && savedAssessment && (
        <div className="mt-4 flex flex-col gap-3">
          <FormMessage variant="info">{RECOMMENDATION_PARTIAL_MESSAGE}</FormMessage>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={() => generateRecommendation(savedAssessment)}
              disabled={isPreparingRecommendation}
            >
              {isPreparingRecommendation ? PREPARING_RECOMMENDATION_MESSAGE : 'إعادة المحاولة'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleMockFallback}
              disabled={isPreparingRecommendation}
            >
              {MOCK_CONSENT_LABEL}
            </Button>
            <Button variant="ghost" onClick={() => navigate('/dashboard', { replace: true })}>
              الذهاب إلى لوحة التحكم
            </Button>
          </div>
        </div>
      )}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        {(step > 1 || showSummary) && (
          <Button
            variant="secondary"
            onClick={goPrevious}
            className="sm:min-w-[120px]"
            disabled={isSubmitting}
          >
            السابق
          </Button>
        )}

        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:justify-end">
          {!showSummary && step < TOTAL_STEPS && (
            <Button
              onClick={goNext}
              className="sm:min-w-[120px]"
              disabled={isSubmitting}
            >
              التالي
            </Button>
          )}

          {!showSummary && step === TOTAL_STEPS && (
            <Button
              onClick={showSummaryHandler}
              className="sm:min-w-[160px]"
              disabled={isSubmitting}
            >
              عرض الملخص
            </Button>
          )}

          {showSummary && (
            <Button
              onClick={onConfirm}
              className="sm:min-w-[200px]"
              disabled={isSubmitting || isPreparingRecommendation}
            >
              {isPreparingRecommendation
                ? PREPARING_RECOMMENDATION_MESSAGE
                : isSubmitting
                  ? 'جاري الحفظ...'
                  : 'تأكيد وحفظ التقييم'}
            </Button>
          )}
        </div>
      </div>

      {Object.keys(errors).length > 0 && !showSummary && (
        <p className="mt-4 text-center text-sm text-error-700" role="alert">
          يرجى تصحيح الحقول المطلوبة قبل المتابعة
        </p>
      )}
    </Container>
  );
}
