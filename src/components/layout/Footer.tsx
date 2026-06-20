import { Link } from 'react-router-dom';

const footerLinks = [
  { label: 'الرئيسية', path: '/' },
  { label: 'ابدأ التقييم', path: '/assessment' },
  { label: 'تسجيل الدخول', path: '/login' },
  { label: 'إنشاء حساب', path: '/signup' },
];

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-neutral-0">
      <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <p className="text-lg font-bold text-neutral-800">
            Vibe<span className="text-primary-600">Fit</span>
          </p>

          <nav aria-label="روابط التذييل">
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
              {footerLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-sm text-neutral-600 transition-colors hover:text-primary-600"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <p className="max-w-xl text-xs leading-relaxed text-neutral-500">
            التوصيات في VibeFit عامة وإرشادية، وليست بديلًا عن مدرب أو مختص
            صحي. المنصة لا تقدم تشخيصًا أو علاجًا طبيًا.
          </p>

          <p className="text-xs text-neutral-400">
            © {new Date().getFullYear()} VibeFit
          </p>
        </div>
      </div>
    </footer>
  );
}
