import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  hasError?: boolean;
  ltr?: boolean;
}

export function Input({
  hasError = false,
  ltr = false,
  className = '',
  ...props
}: InputProps) {
  return (
    <input
      className={[
        'h-11 w-full rounded-md border bg-neutral-0 px-4 text-base text-neutral-800',
        'placeholder:text-neutral-400',
        'focus:outline-none focus:ring-0',
        hasError
          ? 'border-error-500 focus:border-error-500'
          : 'border-neutral-300 focus:border-primary-500 focus:shadow-focus',
        'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400',
        ltr ? 'text-left' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      dir={ltr ? 'ltr' : undefined}
      {...props}
    />
  );
}
