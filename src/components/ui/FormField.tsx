import type { ReactNode } from 'react';
import { Input } from './Input';

interface FormFieldProps {
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  optional?: boolean;
  ltr?: boolean;
  autoComplete?: string;
  placeholder?: string;
}

export function FormField({
  id,
  label,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required = false,
  optional = false,
  ltr = false,
  autoComplete,
  placeholder,
}: FormFieldProps) {
  const labelSuffix = optional ? ' (اختياري)' : required ? ' *' : '';

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-neutral-700">
        {label}
        {labelSuffix}
      </label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        hasError={Boolean(error)}
        ltr={ltr}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-error-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface FormMessageProps {
  children: ReactNode;
  variant: 'success' | 'info';
}

export function FormMessage({ children, variant }: FormMessageProps) {
  const styles =
    variant === 'success'
      ? 'border-success-500 bg-success-50 text-success-700'
      : 'border-info-500 bg-info-50 text-neutral-700';

  return (
    <p
      className={`rounded-md border px-4 py-3 text-sm leading-relaxed ${styles}`}
      role="status"
    >
      {children}
    </p>
  );
}
