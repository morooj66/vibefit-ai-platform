import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import { FormField, FormMessage } from '../components/ui/FormField';
import { AuthFlowError, signUpWithEmail } from '../lib/authFlow';

interface SignupForm {
  name: string;
  email: string;
  password: string;
}

interface SignupErrors {
  email?: string;
  password?: string;
}

function validateSignup(form: SignupForm): SignupErrors {
  const errors: SignupErrors = {};

  if (!form.email.trim()) {
    errors.email = 'يرجى إدخال البريد الإلكتروني';
  }

  if (!form.password) {
    errors.password = 'يرجى إدخال كلمة المرور';
  } else if (form.password.length < 8) {
    errors.password = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
  }

  return errors;
}

export function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<SignupForm>({
    name: '',
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<SignupErrors>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    const validationErrors = validateSignup(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const redirectPath = await signUpWithEmail(form.email, form.password, form.name);
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const message =
        error instanceof AuthFlowError ? error.message : 'تعذّر إنشاء الحساب. حاول مرة أخرى.';
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container narrow className="py-10 md:py-16">
      <Card elevated className="shadow-md">
        <h1 className="text-center text-2xl font-bold text-neutral-800">
          إنشاء حساب
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          بريد وكلمة مرور فقط — ثم تبدأ التقييم مباشرة
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
          <FormField
            id="signup-name"
            label="الاسم"
            value={form.name}
            onChange={(name) => setForm((prev) => ({ ...prev, name }))}
            optional
            autoComplete="name"
            placeholder="اسمك (اختياري)"
          />

          <FormField
            id="signup-email"
            label="البريد الإلكتروني"
            type="email"
            value={form.email}
            onChange={(email) => setForm((prev) => ({ ...prev, email }))}
            error={errors.email}
            required
            ltr
            autoComplete="email"
            placeholder="example@email.com"
          />

          <FormField
            id="signup-password"
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={(password) => setForm((prev) => ({ ...prev, password }))}
            error={errors.password}
            required
            ltr
            autoComplete="new-password"
            placeholder="••••••••"
            hint="8 أحرف على الأقل"
          />

          {authError && <FormMessage variant="info">{authError}</FormMessage>}

          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? 'جاري الدخول...' : 'إنشاء حساب والبدء'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-600">
          لديك حساب؟{' '}
          <Link
            to="/login"
            className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
          >
            سجّل الدخول
          </Link>
        </p>
      </Card>
    </Container>
  );
}
