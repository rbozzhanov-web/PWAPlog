export const DATE_DDMMYY_RE = /^([0-3]\d)\/([01]\d)\/(\d{2})$/;
export const DATE_DDMMYYYY_RE = /^([0-3]\d)\/([01]\d)\/(\d{4})$/;
export const TIME_HHMM_RE = /^([0-1]?\d|2[0-3]):([0-5]\d)$/;
export const AIRPORT_CODE_RE = /^[A-Z]{3,4}$/;
export const REGISTRATION_RE = /^[A-Z0-9]{1,2}-[A-Z0-9]{3,6}$/;
export const FLIGHT_NUMBER_RE = /^[A-Z]{1,3}\s?-?\d{1,4}[A-Z]?$/;

/** Parses "DD/MM/YY" into an ISO "YYYY-MM-DD" date, assuming a 20YY century. */
export function parseDateDdMmYy(token: string): string | null {
  const match = DATE_DDMMYY_RE.exec(token.trim());
  if (!match) return null;
  const [, dd, mm, yy] = match;
  return `20${yy}-${mm}-${dd}`;
}

/** Parses "DD/MM/YYYY" into an ISO "YYYY-MM-DD" date. */
export function parseDateDdMmYyyy(token: string): string | null {
  const match = DATE_DDMMYYYY_RE.exec(token.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

export function isTimeToken(token: string): boolean {
  return TIME_HHMM_RE.test(token.trim());
}

export function isAirportCodeToken(token: string): boolean {
  return AIRPORT_CODE_RE.test(token.trim());
}
