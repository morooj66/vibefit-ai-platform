export const SYSTEM_PROMPT = `أنت مساعد لياقة عام داخل منصة VibeFit.

مهمتك إنشاء توصية رياضية أولية عامة ومنظمة بناءً على بيانات المستخدم.

قواعد صارمة:
- لا تقدم تشخيصًا طبيًا أو علاجًا.
- لا تدّعِ أن التوصية مضمونة.
- راعِ مستوى الخبرة وعدد الأيام والمدة والمعدات.
- لا تتجاهل القيود أو الإصابات.
- لا تقترح تمارين خطرة أو معقدة للمبتدئ.
- اجعل التوصية قابلة للتنفيذ.
- لا تستخدم تشخيصات طبية أو أنظمة غذائية قاسية أو سعرات شديدة الانخفاض.
- لا تستخدم أسماء تجارية أو مكملات.
- اجعل اللغة العربية واضحة ومباشرة.
- أخرج JSON فقط حسب الـschema.
- لا تضف نصًا خارج JSON.`;

interface AssessmentPromptInput {
  age: number;
  primary_goal: string;
  experience_level: string;
  activity_level: string;
  training_days_per_week: number;
  session_duration_minutes: number;
  training_location: string;
  equipment: string;
  constraints_notes: string | null;
  notes: string | null;
}

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

const ACTIVITY_LABELS: Record<string, string> = {
  low: 'منخفض',
  medium: 'متوسط',
  active: 'نشط',
};

const LOCATION_LABELS: Record<string, string> = {
  home: 'المنزل',
  gym: 'النادي',
};

export function buildUserPrompt(assessment: AssessmentPromptInput): string {
  const goal = GOAL_LABELS[assessment.primary_goal] ?? assessment.primary_goal;
  const experience =
    EXPERIENCE_LABELS[assessment.experience_level] ?? assessment.experience_level;
  const activity =
    ACTIVITY_LABELS[assessment.activity_level] ?? assessment.activity_level;
  const location =
    LOCATION_LABELS[assessment.training_location] ?? assessment.training_location;

  const constraints = assessment.constraints_notes?.trim() || 'لا توجد';
  const additionalNotes = assessment.notes?.trim() || 'لا توجد';

  return `أنشئ توصية رياضية أولية باللغة العربية بناءً على البيانات التالية:

- العمر: ${assessment.age}
- الهدف الرئيسي: ${goal}
- مستوى الخبرة: ${experience}
- مستوى النشاط اليومي: ${activity}
- أيام التمرين المتاحة أسبوعيًا: ${assessment.training_days_per_week}
- مدة الجلسة (دقيقة): ${assessment.session_duration_minutes}
- مكان التمرين: ${location}
- المعدات المتاحة: ${assessment.equipment}
- قيود أو إصابات: ${constraints}
- ملاحظات إضافية: ${additionalNotes}

متطلبات الإخراج:
- weekly_plan يجب أن يحتوي بالضبط ${assessment.training_days_per_week} أيام.
- duration_minutes لكل يوم لا يتجاوز ${assessment.session_duration_minutes}.
- عدد التمارين في كل يوم منطقي حسب مدة الجلسة.
- عند وجود قيود أو إصابات، عدّل التوصية بحذر وأضف safety note واضحًا.`;
}

export function buildRepairPrompt(validationError: string): string {
  return `المخرجات السابقة لم تجتز التحقق للسبب التالي: ${validationError}
أصلح JSON فقط ليطابق المتطلبات دون أي نص إضافي.`;
}
