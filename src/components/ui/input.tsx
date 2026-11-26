import type { InputHTMLAttributes } from 'react';

import { cn } from './cn';

const BASE =
  'w-full rounded-sm border bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/70';

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id: string;
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Labelled text input with hint/error wiring. Errors are announced through
 * aria-describedby and aria-invalid — never by colour alone
 * (docs/design-solution.md §10). Validation rules live in the owning module's Zod
 * schema, not here.
 */
export function Input({ id, label, hint, error, className, ...rest }: InputProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
        {rest.required ? (
          <span className="ml-1 text-danger" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          BASE,
          error ? 'border-danger' : 'border-sand focus:border-teal',
          className,
        )}
      />

      {hint ? (
        <p id={hintId} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
