import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';

export function ConfigSetupPage() {
  return (
    <Container className="flex min-h-[60vh] items-center py-10">
      <Card className="mx-auto w-full max-w-lg p-6 text-center">
        <p className="text-xs font-medium text-primary-600">VibeFit</p>
        <h1 className="mt-2 text-xl font-bold text-neutral-900">إعدادات الاتصال غير مكتملة.</h1>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600">
          أضف متغيرات Supabase العامة (<code className="text-xs">VITE_SUPABASE_URL</code> و{' '}
          <code className="text-xs">VITE_SUPABASE_ANON_KEY</code>) في ملف{' '}
          <code className="text-xs">.env</code> محليًا، أو في Vercel → Settings → Environment Variables
          (Production)، أو في Hugging Face Space Variables.
        </p>
        <p className="mt-3 text-xs text-neutral-500">
          لا تضع مفاتيح الخادم (Service Role أو OpenAI) في الواجهة الأمامية.
        </p>
      </Card>
    </Container>
  );
}
