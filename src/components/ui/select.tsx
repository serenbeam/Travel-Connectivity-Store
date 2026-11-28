import type { SelectHTMLAttributes } from 'react';

import { cn } from './cn';

const BASE =
  'w-full rounded-sm border bg-surface px-3 py-2.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60';

export interface SelectOption {
  value: string;
  label: string;
}

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> & {
  id: string;
  label: string;
  options: readonly SelectOption[];
  hint?: string;
  error?: string;
};

/**
 * Labelled native `<select>`. Native on purpose: keyboard handling, mobile pickers, and
 * form semantics come for free, and no client JavaScript is needed for a filter or a form
 * field. Option values are supplied by the caller — this component never derives them.
 */
export function Select({ id, label, options, hint, error, className, ...rest }: SelectProps) {
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

      <select
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(BASE, error ? 'border-danger' : 'border-sand focus:border-teal', className)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

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
