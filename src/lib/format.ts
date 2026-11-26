/**
 * Formatting conventions (AGENTS.md §Language and naming):
 * money is integer IDR, time is stored UTC and rendered in Asia/Jakarta.
 * No ad-hoc date or currency formatting in components — use these helpers.
 */
const WIB_TIME_ZONE = 'Asia/Jakarta';

const idrDigits = new Intl.NumberFormat('id-ID', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const wibDateTime = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const wibDateOnly = new Intl.DateTimeFormat('id-ID', {
  timeZone: WIB_TIME_ZONE,
  dateStyle: 'medium',
});

/** 145000 -> "Rp 145.000" (integer IDR, no decimals). */
export function formatIdr(amount: number): string {
  if (!Number.isFinite(amount)) {
    throw new TypeError('formatIdr expects a finite number');
  }

  return `Rp ${idrDigits.format(Math.trunc(amount))}`;
}

function toDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date value');
  }

  return date;
}

/** "2026-11-28T03:12:44.000Z" -> e.g. "28 Nov 2026, 10.12" (WIB). */
export function formatWibDateTime(value: string | Date): string {
  return wibDateTime.format(toDate(value));
}

/** "2026-11-28T03:12:44.000Z" -> e.g. "28 Nov 2026" (WIB). */
export function formatWibDate(value: string | Date): string {
  return wibDateOnly.format(toDate(value));
}
