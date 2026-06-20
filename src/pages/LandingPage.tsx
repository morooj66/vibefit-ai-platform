import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';

const howItWorksSteps = [
  {
    step: 1,
    title: 'أدخل بياناتك وأهدافك',
    description:
      'عبّئ نموذج تقييم بسيط يوضح مستواك الحالي وما تريد تحقيقه.',
  },
  {
    step: 2,
    title: 'احصل على توصية أولية منظمة',
    description:
      'بعد التقييم، تحصل على توصية عامة منظمة تساعدك على معرفة من أين تبدأ.',
  },
  {
    step: 3,
    title: 'تابع تقدمك أسبوعيًا',
    description:
      'سجّل متابعتك كل أسبوع وراقب نسبة التزامك من لوحة التحكم.',
  },
];

const features = [
  {
    icon: '◈',
    title: 'تقييم رياضي منظم',
    description: 'نموذج واضح يجمع بياناتك وأهدافك في مكان واحد.',
  },
  {
    icon: '▣',
    title: 'توصية أولية عامة',
    description: 'توجيه منظم بناءً على تقييمك — إرشادي وليس خطة طبية.',
  },
  {
    icon: '⌂',
    title: 'لوحة تحكم شخصية',
    description: 'اعرض توصيتك الحالية وحالة تقدمك بسهولة.',
  },
  {
    icon: '◷',
    title: 'متابعة أسبوعية',
    description: 'سجّل نشاطك وملاحظاتك مرة واحدة كل أسبوع.',
  },
  {
    icon: '◎',
    title: 'حساب نسبة الالتزام',
    description: 'مؤشر بسيط يساعدك على فهم مدى التزامك بخطتك.',
  },
];

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center md:mb-12">
      <h2 className="text-2xl font-bold text-neutral-800 md:text-3xl">{title}</h2>
      {subtitle && (
        <p className="mt-3 text-base leading-relaxed text-neutral-600">{subtitle}</p>
      )}
    </div>
  );
}

function StepIcon({ step }: { step: number }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700"
      aria-hidden="true"
    >
      {step}
    </div>
  );
}

function FeatureIcon({ icon }: { icon: string }) {
  return (
    <div
      className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-50 text-lg text-primary-600"
      aria-hidden="true"
    >
      {icon}
    </div>
  );
}

export function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary-50 to-neutral-0 py-16 md:py-24">
        <div
          className="pointer-events-none absolute -start-16 top-8 h-48 w-48 rounded-full bg-primary-200/40 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -end-10 bottom-0 h-56 w-56 rounded-full bg-accent-400/20 blur-3xl"
          aria-hidden="true"
        />

        <Container>
          <div className="relative mx-auto max-w-3xl text-center">
            <p className="text-2xl font-bold text-neutral-800 md:text-3xl">
              Vibe<span className="text-primary-600">Fit</span>
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              منصة لتنظيم رحلتك الرياضية
            </p>

            <h1 className="mt-8 text-3xl font-bold leading-tight text-neutral-900 md:text-4xl lg:text-[2.25rem]">
              نظّم رحلتك الرياضية من البداية
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-neutral-600">
              أدخل بياناتك وأهدافك مرة واحدة، واحصل على توصية أولية منظمة، ثم
              تابع التزامك أسبوعيًا — دون تعقيد أو وعود بنتائج مضمونة.
            </p>

            <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link to="/assessment" className="w-full sm:w-auto">
                <Button size="lg" fullWidth className="sm:min-w-[180px] sm:w-auto">
                  ابدأ التقييم
                </Button>
              </Link>
              <Link to="/login" className="w-full sm:w-auto">
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  className="sm:min-w-[180px] sm:w-auto"
                >
                  تسجيل الدخول
                </Button>
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-14 md:py-20">
        <Container>
          <SectionHeading
            title="كيف تعمل المنصة"
            subtitle="ثلاث خطوات بسيطة لبدء رحلتك وتنظيم متابعتك"
          />
          <div className="grid gap-4 md:grid-cols-3 md:gap-6">
            {howItWorksSteps.map((item) => (
              <Card key={item.step} className="flex flex-col">
                <div className="mb-4 flex items-center gap-3">
                  <StepIcon step={item.step} />
                  <p className="text-sm font-semibold text-primary-600">
                    الخطوة {item.step}
                  </p>
                </div>
                <h3 className="text-lg font-semibold text-neutral-800">
                  {item.title}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-600">
                  {item.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Features */}
      <section className="border-t border-neutral-200 bg-neutral-50 py-14 md:py-20">
        <Container>
          <SectionHeading
            title="مميزات المنصة الحالية"
            subtitle="كل ما تحتاجه لتنظيم بدايتك ومتابعة التزامك"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title}>
                <FeatureIcon icon={feature.icon} />
                <h3 className="mt-4 text-base font-semibold text-neutral-800">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                  {feature.description}
                </p>
              </Card>
            ))}
          </div>
        </Container>
      </section>

      {/* Clarification */}
      <section className="py-14 md:py-20">
        <Container narrow>
          <Card className="border-primary-200 bg-primary-50/50">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-info-50 text-xl text-info-500"
                aria-hidden="true"
              >
                i
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-800">
                  ما الذي تقدمه VibeFit؟
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-neutral-600 md:text-base">
                  VibeFit يساعدك على تنظيم رحلتك الرياضية ومتابعة تقدمك عبر
                  تقييم منظم وتوصية أولية عامة ومتابعة أسبوعية. المنصة
                  توجيهية وتنظيمية —{' '}
                  <strong className="font-semibold text-neutral-700">
                    لا تقدم تشخيصًا طبيًا ولا علاجًا
                  </strong>
                  . إذا كان لديك قلق صحي أو إصابة، استشر مختصًا قبل البدء.
                </p>
              </div>
            </div>
          </Card>
        </Container>
      </section>

      {/* Final CTA */}
      <section className="border-t border-neutral-200 bg-gradient-to-b from-neutral-0 to-primary-50 py-14 md:py-20">
        <Container narrow>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-neutral-800 md:text-3xl">
              جاهز للبدء؟
            </h2>
            <p className="mx-auto mt-3 max-w-md text-neutral-600">
              ابدأ بتقييم بسيط يستغرق دقائق، وستحصل على توصية أولية تناسب
              مستواك الحالي.
            </p>
            <Link to="/assessment" className="mt-8 inline-block w-full sm:w-auto">
              <Button size="lg" fullWidth className="sm:min-w-[200px] sm:w-auto">
                ابدأ التقييم
              </Button>
            </Link>
          </div>
        </Container>
      </section>
    </div>
  );
}
