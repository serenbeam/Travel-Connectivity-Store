import { cn } from './cn';

/**
 * Status pill for order, payment, notification, and active/inactive catalog state.
 *
 * Purely presentational: the caller passes the status it already has; no derivation, no data
 * access, and no promise that a notification "arrived" (design-solution §6.1).
 */
const TONES: Record<string, string> = {
  pending: 'bg-warn/10 text-warn',
  processing: 'bg-teal/10 text-teal',
  paid: 'bg-success/10 text-success',
  succeeded: 'bg-success/10 text-success',
  sent: 'bg-success/10 text-success',
  active: 'bg-success/10 text-success',
  failed: 'bg-danger/10 text-danger',
  inactive: 'bg-sand/60 text-ink-muted',
};

const LABELS: Record<string, string> = {
  pending: 'pending',
  processing: 'processing',
  paid: 'paid',
  succeeded: 'succeeded',
  sent: 'sent',
  failed: 'failed',
  active: 'active',
  inactive: 'inactive',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium',
        TONES[status] ?? 'bg-sand/60 text-ink-muted',
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
