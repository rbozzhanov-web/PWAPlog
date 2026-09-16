/**
 * "What day is it for the pilot holding the phone."
 *
 * Every screen that answers that question has to answer it the same way, and they did not: the
 * roster picked today's card with a device-local key, Home's month total counted device-local
 * months, and Home's own date header formatted `new Date()` in UTC. East of Greenwich that header
 * reads yesterday for as many hours as the device is ahead — five, in Almaty — so the roster
 * highlighted one day while the header above it named another, and on the 1st of a month the
 * header still showed the 30th while "This month" had already rolled over.
 *
 * A roster date like "2026-09-16" is a plain calendar day with no timezone of its own, so these
 * build the key from the device's own calendar fields rather than going through an ISO string,
 * which would shift the date across the UTC boundary.
 */

export function localDateKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function localMonthKey(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
}

/** The date as the pilot's own device reckons it — deliberately not pinned to UTC. */
export function formatLocalDateHeader(value = new Date()): string {
  return new Intl.DateTimeFormat('en', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }).format(value).toUpperCase();
}
