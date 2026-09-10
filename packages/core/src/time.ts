const HHMM_PATTERN = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;

/** Parses "HH:MM" into total minutes. Returns null if the string isn't a valid time. */
export function hhmmToMinutes(value: string | undefined | null): number | null {
  if (!value) return null;
  const match = HHMM_PATTERN.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours * 60 + minutes;
}

/** Formats total minutes as "HH:MM". Negative or non-finite input clamps to "00:00". */
export function minutesToHHMM(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '00:00';
  const minutes = Math.round(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export function minutesToDecimalHours(totalMinutes: number, fractionDigits = 1): number {
  return Number((totalMinutes / 60).toFixed(fractionDigits));
}
