import type { Assessment, MockRecommendationResult, WeeklyPlanItem } from '../../types/recommendation';

const DAY_NAMES = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
] as const;

type PrimaryGoal = 'weight_loss' | 'muscle_gain' | 'general_fitness';
type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

const GOAL_LABELS: Record<PrimaryGoal, string> = {
  weight_loss: 'خسارة الوزن',
  muscle_gain: 'بناء العضلات',
  general_fitness: 'لياقة عامة',
};

const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: 'مبتدئ',
  intermediate: 'متوسط',
  advanced: 'متقدم',
};

interface FocusTemplate {
  focus: string;
  notes: string;
}

const FOCUS_POOL: Record<PrimaryGoal, Record<ExperienceLevel, FocusTemplate[]>> = {
  weight_loss: {
    beginner: [
      { focus: 'مشي سريع', notes: 'شدة معتدلة، ركّز على التنفس المنتظم' },
      { focus: 'تمارين وزن الجسم', notes: 'تمارين أساسية بلا أوزان ثقيلة' },
      { focus: 'كارديو خفيف', notes: 'دراجة ثابتة أو مشي على منحدر' },
      { focus: 'تمدد وحركة', notes: 'جلسة خفيفة لتحسين الحركة اليومية' },
    ],
    intermediate: [
      { focus: 'كارديو متقطع خفيف', notes: 'فترات سريعة قصيرة مع استشفاء كافٍ' },
      { focus: 'قوة عامة', notes: 'تمارين مركبة بأوزان معتدلة' },
      { focus: 'دائرة تدريب', notes: 'تنويع بين كارديو وتمارين مقاومة' },
      { focus: 'مشي سريع طويل', notes: 'حافظ على شدة يمكنك الحديث خلالها' },
      { focus: 'تمارين وظيفية', notes: 'حركات متعددة المفاصل بوتيرة ثابتة' },
    ],
    advanced: [
      { focus: 'كارديو معتدل', notes: 'جلسة عامة بشدة متوسطة' },
      { focus: 'تدريب دائري', notes: 'تنويع بسيط بين تمارين مختلفة' },
      { focus: 'مشي نشط', notes: 'زيادة الخطوة والاستمرارية' },
      { focus: 'تمارين مركبة', notes: 'خطة تجريبية عامة دون تعقيد' },
    ],
  },
  muscle_gain: {
    beginner: [
      { focus: 'تمارين الجزء العلوي', notes: 'ضغط معدّل، صف بأوزان خفيفة' },
      { focus: 'تمارين الجزء السفلي', notes: 'قرفصاء بعمق مريح، وثب خطوة' },
      { focus: 'جسم كامل خفيف', notes: 'تمارين أساسية بأوزان معتدلة' },
      { focus: 'مقاومة بسيطة', notes: 'ركّز على الشكل الصحيح قبل الزيادة' },
    ],
    intermediate: [
      { focus: 'دفع (صدر/كتف)', notes: 'ضغط، تطوير كتف، تمرين مركب' },
      { focus: 'سحب (ظهر/ذراع)', notes: 'سحب، صف، تمارين ظهر متنوعة' },
      { focus: 'ساقين وورك', notes: 'قرفصاء، روماني، وثب' },
      { focus: 'جسم كامل', notes: 'دمج تمارين مركبة بكثافة معتدلة' },
      { focus: 'مقاومة متنوعة', notes: 'تبديل بين مجموعات عضلية' },
    ],
    advanced: [
      { focus: 'تدريب مقاومة عام', notes: 'خطة تجريبية بسيطة دون برمجة احترافية' },
      { focus: 'جسم كامل', notes: 'تمارين مركبة بأوزان معتدلة' },
      { focus: 'دفع وسحب', notes: 'توزيع عام على الجزء العلوي' },
      { focus: 'ساقين', notes: 'تمارين أساسية للجزء السفلي' },
    ],
  },
  general_fitness: {
    beginner: [
      { focus: 'مشي وحركة', notes: 'نشاط خفيف لبناء عادة يومية' },
      { focus: 'تمارين وزن الجسم', notes: 'ضغط معدّل، بلانك، قرفصاء' },
      { focus: 'مرونة أساسية', notes: 'تمدد لطيف بعد الإحماء' },
      { focus: 'كارديو خفيف', notes: 'نشاط مستمر بشدة منخفضة' },
    ],
    intermediate: [
      { focus: 'قوة وكارديو', notes: 'جلسة متوازنة بين المقاومة والتحمل' },
      { focus: 'تمارين وظيفية', notes: 'حركات متعددة المفاصل' },
      { focus: 'تحمل معتدل', notes: 'نشاط مستمر 20–40 دقيقة' },
      { focus: 'مرونة واستقرار', notes: 'تمدد وتمارين توازن' },
      { focus: 'دائرة لياقة', notes: 'تنويع بين تمارين مختلفة' },
    ],
    advanced: [
      { focus: 'لياقة شاملة', notes: 'جلسة عامة متنوعة' },
      { focus: 'قوة عامة', notes: 'تمارين مركبة بشدة معتدلة' },
      { focus: 'كارديو معتدل', notes: 'تحمل بوتيرة ثابتة' },
      { focus: 'حركة ومرونة', notes: 'جلسة خفيفة للتعافي النشط' },
    ],
  },
};

const NUTRITION_POOL: Record<PrimaryGoal, string[]> = {
  weight_loss: [
    'ركّز على وجبات متوازنة ببروتين كافٍ في كل وجبة.',
    'قلّل المشروبات السكرية والوجبات السريعة تدريجيًا.',
    'اشرب ماءً بانتظام طوال اليوم.',
    'لا تقلّل السعرات بشكل مفرط؛ الاستمرارية أهم من السرعة.',
  ],
  muscle_gain: [
    'تناول بروتينًا في كل وجدة رئيسية (لحوم، بيض، بقوليات).',
    'أضف كربوهيدرات معقدة حول وقت التمرين إن أمكن.',
    'لا تهمل الخضروات والألياف لدعم الاستشفاء.',
    'النوم الكافي جزء أساسي من بناء العضلات.',
  ],
  general_fitness: [
    'تناول وجبات متنوعة تشمل بروتينًا وخضرواتًا وفواكه.',
    'تجنّب تخطي الوجبات؛ الانتظام يدعم الطاقة اليومية.',
    'اشرب ماءً قبل وأثناء وبعد النشاط.',
    'اختر وجبات خفيفة صحية بين الوجبات الرئيسية عند الحاجة.',
  ],
};

const BASE_SAFETY_NOTES = [
  'أوقف التمرين فورًا عند الشعور بألم حاد أو دوخة.',
  'ابدأ بإحماء خفيف 5–10 دقائق قبل كل جلسة.',
  'زِد الشدة تدريجيًا ولا تقفز لأحمال أو مدد أطول بسرعة.',
  'هذه توصية عامة وليست بديلًا عن استشارة مختص.',
];

function normalizeGoal(goal: string): PrimaryGoal {
  if (goal === 'weight_loss' || goal === 'muscle_gain' || goal === 'general_fitness') {
    return goal;
  }
  return 'general_fitness';
}

function normalizeExperience(level: string): ExperienceLevel {
  if (level === 'beginner' || level === 'intermediate' || level === 'advanced') {
    return level;
  }
  return 'beginner';
}

function clampDuration(minutes: number, experience: ExperienceLevel): number {
  const base = Math.max(20, Math.min(60, minutes));
  if (experience === 'beginner') {
    return Math.max(20, base - 5);
  }
  return base;
}

function buildWeeklyPlan(
  goal: PrimaryGoal,
  experience: ExperienceLevel,
  trainingDays: number,
  sessionDuration: number,
): WeeklyPlanItem[] {
  const pool = FOCUS_POOL[goal][experience];
  const duration = clampDuration(sessionDuration, experience);
  const days = Math.max(1, Math.min(7, trainingDays));

  return Array.from({ length: days }, (_, index) => {
    const template = pool[index % pool.length];
    return {
      day: DAY_NAMES[index % DAY_NAMES.length],
      focus: template.focus,
      duration_minutes: duration,
      notes: template.notes,
    };
  });
}

function buildSummary(
  goal: PrimaryGoal,
  experience: ExperienceLevel,
  trainingDays: number,
  sessionDuration: number,
): string {
  const goalLabel = GOAL_LABELS[goal];
  const expLabel = EXPERIENCE_LABELS[experience];
  const duration = clampDuration(sessionDuration, experience);

  const intensityNote =
    experience === 'beginner'
      ? 'خطة بسيطة بشدة معتدلة مناسبة للبداية.'
      : experience === 'intermediate'
        ? 'خطة متنوعة مع الحفاظ على عدد أيامك المتاحة.'
        : 'توصية تجريبية عامة دون تعقيد احترافي.';

  return `بناءً على هدفك (${goalLabel}) ومستوى خبرتك (${expLabel})، ننصح بـ ${trainingDays} أيام تمرين أسبوعيًا، كل جلسة حوالي ${duration} دقيقة. ${intensityNote}`;
}

function buildSafetyNotes(constraintsNotes: string | null): string[] {
  const notes = [...BASE_SAFETY_NOTES];

  const trimmed = constraintsNotes?.trim();
  if (trimmed) {
    notes.unshift(
      `أشرت إلى قيود أو ملاحظات: «${trimmed}». عدّل الحركات حسب راحتك وتجنّب ما يزيد الألم. استشر مختصًا عند الحاجة.`,
    );
  }

  return notes;
}

function pickNutritionNotes(goal: PrimaryGoal, trainingDays: number): string[] {
  const pool = NUTRITION_POOL[goal];
  const count = Math.min(3, pool.length);
  return Array.from({ length: count }, (_, i) => pool[(i + trainingDays) % pool.length]);
}

/**
 * توليد توصية تجريبية ثابتة (deterministic) من بيانات التقييم.
 * لا تستخدم AI أو عشوائية.
 */
export function generateMockRecommendation(assessment: Assessment): MockRecommendationResult {
  const goal = normalizeGoal(assessment.primary_goal);
  const experience = normalizeExperience(assessment.experience_level);
  const trainingDays = assessment.training_days_per_week;
  const sessionDuration = assessment.session_duration_minutes;

  const weekly_plan = buildWeeklyPlan(goal, experience, trainingDays, sessionDuration);
  const summary = buildSummary(goal, experience, trainingDays, sessionDuration);
  const nutrition_notes = pickNutritionNotes(goal, trainingDays);
  const safety_notes = buildSafetyNotes(assessment.constraints_notes);

  return {
    summary,
    weekly_plan,
    nutrition_notes,
    safety_notes,
  };
}
