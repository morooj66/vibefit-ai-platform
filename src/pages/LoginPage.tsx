import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Container } from '../components/ui/Container';
import { FormField, FormMessage } from '../components/ui/FormField';
import { AuthFlowError, signInWithEmail } from '../lib/authFlow';

interface LoginForm {
  email: string;
  password: string;
}

interface LoginErrors {
  email?: string;
  password?: string;
}

function validateLogin(form: LoginForm): LoginErrors {
  const errors: LoginErrors = {};

  if (!form.email.trim()) {
    errors.email = 'يرجى إدخال البريد الإلكتروني';
  }

  if (!form.password) {
    errors.password = 'يرجى إدخال كلمة المرور';
  }

  return errors;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<LoginForm>({ email: '', password: '' });
  const [errors, setErrors] = useState<LoginErrors>({});
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError('');

    const validationErrors = validateLogin(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setLoading(true);

    try {
      const redirectPath = await signInWithEmail(form.email, form.password);
      navigate(redirectPath, { replace: true });
    } catch (error) {
      const message =
        error instanceof AuthFlowError ? error.message : 'تعذّر تسجيل الدخول. حاول مرة أخرى.';
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container narrow className="py-10 md:py-16">
      <Card elevated className="shadow-md">
        <h1 className="text-center text-2xl font-bold text-neutral-800">
          تسجيل الدخول
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          أدخل بريدك وكلمة المرور
        </p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
          <FormField
            id="login-email"
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
            id="login-password"
            label="كلمة المرور"
            type="password"
            value={form.password}
            onChange={(password) => setForm((prev) => ({ ...prev, password }))}
            error={errors.password}
            required
            ltr
            autoComplete="current-password"
            placeholder="••••••••"
          />

          {authError && <FormMessage variant="info">{authError}</FormMessage>}

          <Button type="submit" fullWidth size="lg" disabled={loading}>
            {loading ? 'جاري الدخول...' : 'دخول'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-neutral-600">
          ليس لديك حساب؟{' '}
          <Link
            to="/signup"
            className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
          >
            أنشئ حسابًا
          </Link>
        </p>
      </Card>
    </Container>
  );
}
