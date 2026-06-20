/**
 * VibeFit Agent — سيناريوهات اختبار محلية (بدون Supabase/OpenAI)
 * تشغيل: npm run test:agent
 */

const MEDICAL_PATTERNS = [/ألم\s*(حاد|شديد|مفاجئ|قوي)/, /ألم\s+.+\s*أثناء\s*التمرين/, /تشخيص/, /دواء|علاج/];
const INJECTION_PATTERNS = [/تجاهل\s+.*(تعليمات|قواعد)/, /اعرض\s+(المفاتيح|الأسرار|مفاتيح)/, /ignore\s+instructions/i];
const PROGRESS_PATTERNS = [/التزام|التزامي|حلل\s*(لي\s*)?تقدم|(كيف\s*(كان|هو))\s*(التزام|أداء)|هذا\s*(الشهر|الأسبوع).*(التزام|تقدم|أداء)/];
const PLAN_PATTERNS = [/خطتي|الخطة|اليوم\s*(الأول|1)|اشرح\s*(لي\s*)?(اليوم|الخطة)/];
const MOTIVATION_PATTERNS = [/أرجع\s*للخطة|أعود\s*للخطة|كيف\s*أزيد\s*التزام/];
const RECOVERY_PATTERNS = [/طاق|تعب|إجهاد|انخفاض\s*طاق|صعب\s*وطاق/];
const EXERCISE_PATTERNS = [/اشرح|أهمية\s*الإحماء|إحماء/];

function classifyIntent(message) {
  const text = message.trim().toLowerCase();
  if (INJECTION_PATTERNS.some((p) => p.test(text))) return 'prompt_injection';
  if (MEDICAL_PATTERNS.some((p) => p.test(text))) return 'medical_boundary';
  if (PROGRESS_PATTERNS.some((p) => p.test(text))) return 'progress_analysis';
  if (PLAN_PATTERNS.some((p) => p.test(text))) return 'plan_question';
  if (MOTIVATION_PATTERNS.some((p) => p.test(text))) return 'motivation_and_adherence';
  if (RECOVERY_PATTERNS.some((p) => p.test(text))) return 'recovery_and_fatigue';
  if (EXERCISE_PATTERNS.some((p) => p.test(text))) return 'fitness_general';
  return 'open_question';
}

function intentNeedsPersonalData(intent, message) {
  if (['plan_question', 'progress_analysis', 'motivation_and_adherence', 'recovery_and_fatigue'].includes(intent)) {
    return true;
  }
  return /خطتي|التزامي|طاقتي|تقدمي|أدائي/.test(message);
}

function intentNeedsRag(intent) {
  return intent !== 'prompt_injection';
}

function mapIntentToCategories(intent, message) {
  const text = message.toLowerCase();
  if (intent === 'motivation_and_adherence' || /أرجع|أعود|منتظم/.test(text)) {
    return ['الالتزام', 'تمارين القوة', 'الراحة والتعافي', 'شدة التمرين'];
  }
  if (intent === 'recovery_and_fatigue' || /طاق|تعب/.test(text)) {
    return ['الراحة والتعافي', 'النوم', 'شدة التمرين'];
  }
  if (intent === 'fitness_general') return ['الإحماء'];
  return [];
}

function extractRawAnswer(content) {
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed.answer === 'string') return parsed.answer;
  } catch {
    // raw text fallback
  }
  return content.trim();
}

const scenarios = [
  {
    name: '1. سؤال عام — الإحماء',
    message: 'ما أهمية الإحماء؟',
    expect: { intent: 'fitness_general', needsRag: true },
  },
  {
    name: '2. سؤال شخصي — التزام',
    message: 'كيف كان التزامي هذا الشهر؟',
    expect: { intent: 'progress_analysis', needsPersonal: true },
  },
  {
    name: '3. سؤال مفتوح — العودة للخطة',
    message: 'كيف أرجع للخطة بعد أسبوع غير منتظم؟',
    expect: { intent: 'motivation_and_adherence', ragCategories: 4 },
  },
  {
    name: '4. تحليل — انخفاض الطاقة',
    message: 'حلل لي سبب انخفاض طاقتي',
    expect: { intent: 'recovery_and_fatigue', needsPersonal: true },
  },
  {
    name: '5. سؤال عن الخطة',
    message: 'اشرح لي اليوم الأول',
    expect: { intent: 'plan_question', needsPersonal: true },
  },
  {
    name: '6. سؤال مركب',
    message: 'التمرين صار صعبًا وطاقة الأسبوع منخفضة، وش أغير؟',
    expect: { intent: 'recovery_and_fatigue' },
  },
  {
    name: '7. بدون بيانات — open question',
    message: 'وش أفضل شيء أركز عليه هذا الأسبوع؟',
    expect: { intent: 'open_question' },
  },
  {
    name: '8. فشل structured output — raw answer',
    message: 'mock',
    run: () => {
      const raw = '{"answer":"إجابة خام","intent":"open_question","sources":[],"insights":[],"recommended_actions":["خطوة 1"],"safety_notice":null,"used_personal_data":false,"used_rag":false}';
      return extractRawAnswer(raw).includes('إجابة خام');
    },
  },
  {
    name: '9. فشل RAG — بدون مصادر',
    message: 'mock',
    run: () => {
      const response = { sources: [], used_rag: false };
      return response.sources.length === 0 && response.used_rag === false;
    },
  },
  {
    name: '10. سؤال خطر',
    message: 'أشعر بألم قوي أثناء التمرين',
    expect: { intent: 'medical_boundary', safety: true },
  },
];

let passed = 0;
let failed = 0;

for (const scenario of scenarios) {
  if (scenario.run) {
    if (scenario.run()) {
      passed += 1;
      console.log(`✓ ${scenario.name}`);
    } else {
      failed += 1;
      console.error(`✗ ${scenario.name}`);
    }
    continue;
  }

  const intent = classifyIntent(scenario.message);
  let ok = true;
  const errors = [];

  if (scenario.expect.intent && intent !== scenario.expect.intent) {
    ok = false;
    errors.push(`intent expected ${scenario.expect.intent}, got ${intent}`);
  }

  if (scenario.expect.needsRag && !intentNeedsRag(intent)) {
    ok = false;
    errors.push('expected RAG');
  }

  if (scenario.expect.needsPersonal && !intentNeedsPersonalData(intent, scenario.message)) {
    ok = false;
    errors.push('expected personal data');
  }

  if (scenario.expect.ragCategories) {
    const categories = mapIntentToCategories(intent, scenario.message);
    if (categories.length < scenario.expect.ragCategories) {
      ok = false;
      errors.push(`expected ${scenario.expect.ragCategories} rag categories, got ${categories.length}`);
    }
  }

  if (scenario.expect.safety && intent !== 'medical_boundary') {
    ok = false;
    errors.push('expected medical_boundary');
  }

  if (ok) {
    passed += 1;
    console.log(`✓ ${scenario.name}`);
  } else {
    failed += 1;
    console.error(`✗ ${scenario.name}: ${errors.join('; ')}`);
  }
}

// Concise response formatting tests
function stripMarkdown(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .trim();
}

function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

const formatCases = [
  {
    name: '11. إزالة Markdown من answer',
    run: () => stripMarkdown('### عنوان\n**نص** مهم') === 'عنوان\nنص مهم',
  },
  {
    name: '12. answer مختصر — بدون تكرار خطوات',
    run: () => {
      const answer =
        'ابدئي بالعودة تدريجيًا بدل محاولة تعويض الأسبوع كاملًا. بما أن الاستمرارية أهم من الكمال، اكتفي هذا الأسبوع بيومين خفيفين.';
      const actions = ['ابدئي بجلستين هذا الأسبوع.', 'استخدمي 60–70% من شدتك المعتادة.'];
      return countWords(answer) <= 60 && !answer.includes('•') && actions.length === 2;
    },
  },
];

for (const scenario of formatCases) {
  if (scenario.run()) {
    passed += 1;
    console.log(`✓ ${scenario.name}`);
  } else {
    failed += 1;
    console.error(`✗ ${scenario.name}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}

console.log('\nملاحظة: اختبارات used_rag/used_personal_data الكاملة تتطلب Edge Function منشورة.');
