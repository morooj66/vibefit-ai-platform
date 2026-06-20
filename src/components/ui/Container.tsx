import type { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
  narrow?: boolean;
}

export function Container({
  children,
  className = '',
  narrow = false,
}: ContainerProps) {
  return (
    <div
      className={[
        'mx-auto w-full px-4 sm:px-6 lg:px-8',
        narrow ? 'max-w-[480px]' : 'max-w-[960px]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
