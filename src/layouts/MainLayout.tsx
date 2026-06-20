import { Outlet } from 'react-router-dom';
import { Footer } from '../components/layout/Footer';
import { MobileTabBar } from '../components/layout/MobileTabBar';
import { Navbar } from '../components/layout/Navbar';
import type { LayoutVariant } from '../types';

interface MainLayoutProps {
  variant: LayoutVariant;
}

export function MainLayout({ variant }: MainLayoutProps) {
  const showFooter = variant === 'public';
  const showTabBar = variant === 'app';
  const pageBackground = variant === 'app' ? 'bg-neutral-0' : 'bg-neutral-50';

  return (
    <div className={`flex min-h-screen flex-col ${pageBackground}`}>
      {variant !== 'minimal' && <Navbar variant={variant} />}

      <main
        className={[
          'flex-1',
          showTabBar ? 'pb-16 md:pb-0' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Outlet />
      </main>

      {showFooter && <Footer />}
      {showTabBar && <MobileTabBar />}
    </div>
  );
}
