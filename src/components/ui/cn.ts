export type ClassValue = string | number | false | null | undefined;

/**
 * Minimal className joiner. A dependency (clsx/tailwind-merge) is intentionally not
 * used for three primitives — see the dependency review in WORK_TRACKER.md / E-2 scope.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter((value): value is string | number => Boolean(value)).join(' ');
}
