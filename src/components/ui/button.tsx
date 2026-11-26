import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from './cn';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-sm px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60';

const VARIANTS = {
  primary: 'bg-forest text-white hover:bg-ink',
  secondary: 'border border-sand bg-surface text-ink hover:border-sand-strong',
  ghost: 'text-teal hover:text-forest',
  danger: 'bg-danger text-white hover:opacity-90',
} as const;

export type ButtonVariant = keyof typeof VARIANTS;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  children?: ReactNode;
};

/**
 * Presentational trigger. No business logic, no data access (docs/design-solution.md §7).
 * It intentionally omits `'use client'` so it can render from a Server Component and
 * still be used inside client forms; interactivity comes from the parent.
 */
export function Button({
  variant = 'primary',
  loading = false,
  className,
  disabled,
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(BASE, VARIANTS[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span aria-hidden="true">…</span> : null}
      {children}
    </button>
  );
}
