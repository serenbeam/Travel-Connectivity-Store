import type { ReactNode } from 'react';

import { cn } from '@/components/ui/cn';

/**
 * Vertical section rhythm only (64px mobile, 96px desktop — design-solution §5.3).
 * No heading logic: each page owns its own `h1`/`h2` so the outline stays correct.
 */
export function Section({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div';
}) {
  return <Tag className={cn('py-16 md:py-24', className)}>{children}</Tag>;
}
