export type AgentIntent =
  | 'fitness_general'
  | 'plan_question'
  | 'progress_analysis'
  | 'exercise_explanation'
  | 'motivation_and_adherence'
  | 'recovery_and_fatigue'
  | 'nutrition_general'
  | 'safety'
  | 'medical_boundary'
  | 'open_question'
  | 'prompt_injection';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?instructions/i,
  /system\s+prompt/i,
  /api\s*key|secret|token|password/i,
  /تجاهل\s+.*(تعليمات|قواعد)/,
  /اعرض\s+(المفاتيح|الأسرار|مفاتيح|كلمة\s*المرور)/,
  /كشف\s+(النظام|الأسرار)/,
  /override/i,
];

const MEDICAL_BOUNDARY_PATTERNS = [
  /تشخيص/,
  /دواء|أدوية|علاج|وصفة\s*طبية/,
  /ألم\s*(حاد|شديد|مفاجئ|قوي)/,
  /ألم\s+.+\s*(أثناء|عند)\s*(التمرين|الحركة)/,
  /صدر|خدر|دوخة\s*شديدة/,
  /cannot breathe|chest pain/i,
  /إصابة\s*حادة|نزيف/,
];

const SAFETY_PATTERNS = [
  /إشارات\s*إيقاف|متى\s*أوقف/,
  /سلامة\s*التمرين|احتياط/,
];

const PROGRESS_PATTERNS = [
  /التزام|التزامي|التزامك/,
  /تقدم|تقدّم|أدائي|أداءي|حلل\s*(لي\s*)?تقدم/,
  /(كيف\s*(كان|هو))\s*(التزام|أداء)/,
  /هذا\s*(الشهر|الأسبوع).*(التزام|تقدم|أداء)|آخر\s*(أسبوع|أسابيع).*(التزام|طاق|تقدم)/,
  /متابعت|check.?in/i,
  /من\s*البداية/,
];

const PLAN_PATTERNS = [
  /خطتي|خطتك|الخطة|خطة\s*اليوم/,
  /توصية|توصيتي/,
  /اليوم\s*(الأول|1)|أول\s*يوم/,
  /weekly\s*plan/i,
  /اشرح\s*(لي\s*)?(اليوم|الخطة)/,
  /هل\s*خطتي\s*مناسبة/,
];

const MOTIVATION_PATTERNS = [
  /تحفيز|محبط|كسل|لا\s*أريد/,
  /كيف\s*أزيد\s*التزام/,
  /أسبوع\s*(سيئ|غير\s*منتظم)|أرجع\s*للخطة|أعود\s*للخطة/,
  /العودة\s*للخطة/,
];

const RECOVERY_PATTERNS = [
  /تعب|إجهاد|طاقة\s*(منخفضة|قليلة)/,
  /تعاف|راحة|إرهاق/,
  /ليش\s*طاقتي|سبب\s*انخفاض\s*طاق/,
  /الفرق\s*بين\s*التعب/,
  /أقلل\s*الأيام|كثيرة\s*التمارين/,
];

const NUTRITION_PATTERNS = [
  /تغذية|غذاء|سعرات|بروtein|بروتين|كرب/,
  /حمية|دايت|diet/i,
];

const EXERCISE_PATTERNS = [
  /اشرح|شرح|كيف\s*أعمل/,
  /squat|push.?up|قرفصاء|ضغط/i,
  /تمرين\s*معين|حركة\s*معينة/,
];

const FITNESS_GENERAL_PATTERNS = [
  /إحماء|التهدئة|كارديو|مرونة|قوة/,
  /أهمية\s*ال/,
  /كم\s*جلسة|عدد\s*الأيام/,
];

const PERSONAL_PRONOUN_PATTERNS = [
  /خطتي|التزامي|طاقتي|تقدمي|أدائي|تقييمي|متابع/,
  /لي\s*مناسب|عندي|أحس|أشعر/,
];

export function messageImpliesPersonalData(message: string): boolean {
  const text = message.trim().toLowerCase();
  return PERSONAL_PRONOUN_PATTERNS.some((pattern) => pattern.test(text));
}

export function classifyIntent(message: string): AgentIntent {
  const text = message.trim().toLowerCase();

  if (INJECTION_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'prompt_injection';
  }

  if (MEDICAL_BOUNDARY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'medical_boundary';
  }

  if (SAFETY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'safety';
  }

  if (PROGRESS_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'progress_analysis';
  }

  if (PLAN_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'plan_question';
  }

  if (MOTIVATION_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'motivation_and_adherence';
  }

  if (RECOVERY_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'recovery_and_fatigue';
  }

  if (NUTRITION_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'nutrition_general';
  }

  if (EXERCISE_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'exercise_explanation';
  }

  if (FITNESS_GENERAL_PATTERNS.some((pattern) => pattern.test(text))) {
    return 'fitness_general';
  }

  return 'open_question';
}

export function intentNeedsPersonalData(intent: AgentIntent, message: string, hasUserId: boolean): boolean {
  if (!hasUserId) return false;

  const personalIntents: AgentIntent[] = [
    'plan_question',
    'progress_analysis',
    'motivation_and_adherence',
    'recovery_and_fatigue',
  ];

  if (personalIntents.includes(intent)) return true;
  if (intent === 'open_question' && messageImpliesPersonalData(message)) return true;

  return false;
}

export function intentNeedsRag(intent: AgentIntent): boolean {
  return intent !== 'prompt_injection';
}

export function intentNeedsRecommendation(intent: AgentIntent): boolean {
  return ['plan_question', 'progress_analysis', 'open_question'].includes(intent);
}

export function intentNeedsAnalytics(intent: AgentIntent, message: string): boolean {
  if (['progress_analysis', 'recovery_and_fatigue', 'motivation_and_adherence'].includes(intent)) {
    return true;
  }
  return messageImpliesPersonalData(message);
}

export function requiresSafetyNotice(intent: AgentIntent): boolean {
  return intent === 'medical_boundary' || intent === 'safety';
}
