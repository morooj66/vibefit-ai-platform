export type ProactiveEventType =
  | 'user_signed_up'
  | 'assessment_completed'
  | 'recommendation_completed'
  | 'weekly_checkin_missing'
  | 'adherence_dropped'
  | 'adherence_improved'
  | 'low_energy_detected'
  | 'high_difficulty_detected'
  | 'inactive_user_detected'
  | 'weekly_summary_due';

export type EventCategory = 'operational' | 'motivational';

export interface EventConfig {
  category: EventCategory;
  preferenceKey:
    | 'welcome_emails'
    | 'progress_emails'
    | 'reminder_emails'
    | 'weekly_summary';
  defaultSubject: string;
  ctaPath: string;
  ctaText: string;
  useRag: boolean;
  useAnalytics: boolean;
  useRecommendation: boolean;
  ragCategories: string[];
  maxWords: number;
  minWords: number;
}

const APP_URL = Deno.env.get('VIBEFIT_APP_URL') ?? 'https://vibefit.app';

export function buildAppUrl(path: string): string {
  const base = APP_URL.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export const EVENT_CONFIGS: Record<ProactiveEventType, EventConfig> = {
  user_signed_up: {
    category: 'operational',
    preferenceKey: 'welcome_emails',
    defaultSubject: 'أهلًا بك في VibeFit',
    ctaPath: '/#/assessment',
    ctaText: 'ابدئي التقييم',
    useRag: false,
    useAnalytics: false,
    useRecommendation: false,
    ragCategories: [],
    maxWords: 120,
    minWords: 60,
  },
  assessment_completed: {
    category: 'operational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'استلمنا تقييمك — جاري تجهيز التوصية',
    ctaPath: '/#/dashboard',
    ctaText: 'تابعي لوحة التحكم',
    useRag: false,
    useAnalytics: false,
    useRecommendation: false,
    ragCategories: [],
    maxWords: 130,
    minWords: 70,
  },
  recommendation_completed: {
    category: 'operational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'خطتك الأسبوعية جاهزة',
    ctaPath: '/#/dashboard',
    ctaText: 'افتحي خطتك',
    useRag: false,
    useAnalytics: false,
    useRecommendation: true,
    ragCategories: [],
    maxWords: 140,
    minWords: 70,
  },
  weekly_checkin_missing: {
    category: 'motivational',
    preferenceKey: 'reminder_emails',
    defaultSubject: 'تذكير لطيف — كيف كان أسبوعك؟',
    ctaPath: '/#/check-in',
    ctaText: 'سجّلي متابعتك',
    useRag: false,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: ['الالتزام'],
    maxWords: 120,
    minWords: 60,
  },
  adherence_dropped: {
    category: 'motivational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'خطوة بسيطة للعودة إلى خطتك',
    ctaPath: '/#/check-in',
    ctaText: 'سجّلي متابعتك',
    useRag: true,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: ['الالتزام', 'الراحة والتعافي', 'شدة التمرين', 'التدريب للمبتدئين'],
    maxWords: 160,
    minWords: 80,
  },
  adherence_improved: {
    category: 'motivational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'تحسّن واضح — استمري بهذا الإيقاع',
    ctaPath: '/#/dashboard',
    ctaText: 'تابعي خطتك',
    useRag: false,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: [],
    maxWords: 130,
    minWords: 70,
  },
  low_energy_detected: {
    category: 'motivational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'لاحظنا انخفاض طاقتك — خطوات خفيفة للتعافي',
    ctaPath: '/#/check-in',
    ctaText: 'حدّثي متابعتك',
    useRag: true,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: ['الراحة والتعافي', 'النوم', 'شدة التمرين', 'السلامة أثناء التمرين'],
    maxWords: 170,
    minWords: 80,
  },
  high_difficulty_detected: {
    category: 'motivational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'قد تحتاجين تخفيفًا مؤقتًا',
    ctaPath: '/#/dashboard',
    ctaText: 'راجعي خطتك',
    useRag: true,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: ['شدة التمرين', 'الراحة والتعافي', 'السلامة أثناء التمرين', 'تمارين القوة'],
    maxWords: 170,
    minWords: 80,
  },
  inactive_user_detected: {
    category: 'motivational',
    preferenceKey: 'progress_emails',
    defaultSubject: 'نحن هنا عندما تكونين جاهزة',
    ctaPath: '/#/dashboard',
    ctaText: 'افتحي خطتك',
    useRag: true,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: ['الالتزام', 'التدريب للمبتدئين'],
    maxWords: 130,
    minWords: 70,
  },
  weekly_summary_due: {
    category: 'motivational',
    preferenceKey: 'weekly_summary',
    defaultSubject: 'ملخص أسبوعك في VibeFit',
    ctaPath: '/#/dashboard',
    ctaText: 'افتحي لوحة التحكم',
    useRag: true,
    useAnalytics: true,
    useRecommendation: true,
    ragCategories: ['الالتزام', 'الراحة والتعافي', 'شدة التمرين'],
    maxWords: 180,
    minWords: 100,
  },
};

export function isValidEventType(value: string): value is ProactiveEventType {
  return value in EVENT_CONFIGS;
}

export function goalLabel(goal: string | undefined): string {
  switch (goal) {
    case 'weight_loss':
      return 'تحسين اللياقة والنشاط';
    case 'muscle_gain':
      return 'بناء القوة';
    case 'general_fitness':
      return 'لياقة عامة';
    default:
      return 'هدفك الرياضي';
  }
}

export function levelLabel(level: string | undefined): string {
  switch (level) {
    case 'beginner':
      return 'مبتدئ';
    case 'intermediate':
      return 'متوسط';
    case 'advanced':
      return 'متقدم';
    default:
      return 'مناسب لمستواك';
  }
}
