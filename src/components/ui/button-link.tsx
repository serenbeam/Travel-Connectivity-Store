import Link from 'next/link';
import type { ReactNode } from 'react';

import { buttonClassName, type ButtonVariant } from './button';

/**
 * Navigation trigger styled exactly like `Button`.
 * `Button` renders a `<button>`; the storefront CTAs are links, so they must not fake a
 * button element (keyboard and middle-click behaviour, prefetch).
 */
export function ButtonLink({
  href,
  variant = 'primary',
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, className)}>
      {children}
    </Link>
  );
}
