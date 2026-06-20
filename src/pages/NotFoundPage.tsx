import { Link } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Container } from '../components/ui/Container';

export function NotFoundPage() {
  return (
    <Container narrow className="flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="text-6xl font-bold text-primary-500">404</p>
      <h1 className="mt-4 text-2xl font-bold">الصفحة غير موجودة</h1>
      <p className="mt-2 text-neutral-600">
        المسار الذي طلبته غير متوفر في التطبيق.
      </p>
      <Link to="/" className="mt-8">
        <Button>العودة للرئيسية</Button>
      </Link>
    </Container>
  );
}
