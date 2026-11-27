import type { ReactNode } from 'react';

import { cn } from '@/components/ui/cn';

/** Page gutter and max width (design-solution §5.3): 1200px, 20px / 32px gutters. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[1200px] px-5 md:px-8', className)}>
      {children}
    </div>
  );
}
