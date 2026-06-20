import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { signOut } from '../../contexts/AuthContext';
import type { LayoutVariant } from '../../types';

interface NavbarProps {
  variant: LayoutVariant;
}

const appLinks = [
  { label: 'لوحة التحكم', path: '/dashboard' },
  { label: 'المساعد', path: '/assistant' },
  { label: 'التقييم', path: '/assessment' },
  { label: 'المتابعة', path: '/check-in' },
];

export function Navbar({ variant }: NavbarProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setMenuOpen(false);
    navigate('/login', { replace: true });
  };

  const isPublic = variant === 'public';
  const isAuth = variant === 'auth';
  const isApp = variant === 'app';

  const logoTo = isPublic ? '/' : '/dashboard';

  return (
    <header className="sticky top-0 z-40 border-b border-neutral-200 bg-neutral-0">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          {isApp && (
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-md text-neutral-700 hover:bg-neutral-100 md:hidden"
              aria-label="فتح القائمة"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="text-xl leading-none">☰</span>
            </button>
          )}

          <Link to={logoTo} className="text-xl font-bold text-neutral-800">
            Vibe<span className="text-primary-600">Fit</span>
          </Link>
        </div>

        <nav className="hidden items-center gap-6 md:flex">
          {isApp &&
            appLinks.map((link) => (
              <NavLink
                key={link.path}
                to={link.path}
                className={({ isActive }) =>
                  [
                    'text-sm font-medium transition-colors',
                    isActive
                      ? 'border-b-2 border-primary-500 pb-0.5 text-primary-600'
                      : 'text-neutral-600 hover:text-primary-600',
                  ].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}

          {isPublic && (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-neutral-600 hover:text-primary-600"
              >
                تسجيل الدخول
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-primary-500 px-4 py-2 text-sm font-medium text-neutral-0 hover:bg-primary-600"
              >
                ابدأ
              </Link>
            </>
          )}

          {isAuth && (
            <Link
              to="/login"
              className="text-sm font-medium text-neutral-600 hover:text-primary-600"
            >
              لديك حساب؟
            </Link>
          )}

          {isApp && (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm font-medium text-neutral-600 hover:text-primary-600"
            >
              خروج
            </button>
          )}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          {isPublic && (
            <>
              <Link
                to="/login"
                className="text-sm font-medium text-neutral-600"
              >
                دخول
              </Link>
              <Link
                to="/signup"
                className="rounded-md bg-primary-500 px-3 py-1.5 text-sm font-medium text-neutral-0"
              >
                ابدأ
              </Link>
            </>
          )}
        </div>
      </div>

      {isApp && menuOpen && (
        <nav className="border-t border-neutral-200 bg-neutral-0 px-4 py-3 md:hidden">
          <ul className="space-y-2">
            {appLinks.map((link) => (
              <li key={link.path}>
                <NavLink
                  to={link.path}
                  className={({ isActive }) =>
                    [
                      'block rounded-md px-3 py-2 text-sm font-medium',
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-neutral-700 hover:bg-neutral-100',
                    ].join(' ')
                  }
                  onClick={() => setMenuOpen(false)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full rounded-md px-3 py-2 text-start text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                خروج
              </button>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
