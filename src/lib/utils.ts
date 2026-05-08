/**
 * Shared utility functions
 *
 * Only pure helpers with no layer-specific imports.
 */

/**
 * Formats an ISO date string to a human-readable locale string.
 */
export function formatDate(iso: string, locale = 'es-ES'): string {
  return new Date(iso).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Clamps a number between min and max (inclusive).
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
