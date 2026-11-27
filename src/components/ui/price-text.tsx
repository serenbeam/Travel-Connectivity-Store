import { formatIdr } from '@/lib/format';

import { cn } from './cn';

/**
 * Single place where an integer IDR amount becomes visible text (design-solution §7).
 * `whitespace-nowrap` keeps "Rp" and the amount on one line, which is what the
 * non-breaking space in design §9 is for — the formatter itself is shared with E-3 and
 * is not modified.
 */
export function PriceText({
  amount,
  size = 'card',
  className,
}: {
  amount: number;
  size?: 'card' | 'detail';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'tabular whitespace-nowrap font-semibold',
        size === 'detail' ? 'text-2xl' : 'text-xl',
        className,
      )}
    >
      {formatIdr(amount)}
    </span>
  );
}
