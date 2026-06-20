import { NavLink } from 'react-router-dom';

const tabs = [
  { label: 'الرئيسية', path: '/dashboard', icon: '⌂' },
  { label: 'المساعد', path: '/assistant', icon: '✦' },
  { label: 'التقييم', path: '/assessment', icon: '☰' },
  { label: 'المتابعة', path: '/check-in', icon: '◷' },
];

export function MobileTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-neutral-0 md:hidden"
      aria-label="التنقل السفلي"
    >
      <ul className="grid h-16 grid-cols-4">
        {tabs.map((tab) => (
          <li key={tab.path}>
            <NavLink
              to={tab.path}
              className={({ isActive }) =>
                [
                  'flex h-full flex-col items-center justify-center gap-1 text-xs font-medium',
                  isActive ? 'text-primary-600' : 'text-neutral-500',
                ].join(' ')
              }
            >
              <span aria-hidden="true" className="text-base">
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
