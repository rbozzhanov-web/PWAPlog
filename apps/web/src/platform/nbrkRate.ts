import { lastDayOfMonthDdMmYyyy, parseNbrkEurRate } from '@pilot-logbook/core';

/**
 * The app's own proxy, not nationalbank.kz directly.
 *
 * The bank's feed carries no `Access-Control-Allow-Origin`, so a browser will not let this app read
 * a response fetched straight from it. `functions/api/nbrk-rate.ts` forwards the same XML from this
 * origin, where there is no cross-origin request to refuse.
 */
const NBRK_RATES_URL = '/api/nbrk-rate';

interface NbrkResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type NbrkRequest = (url: string) => Promise<NbrkResponse>;

export interface NbrkEurRate {
  rate: number;
  /** The day the rate is actually for, "DD.MM.YYYY" — not always the month's last day. */
  fdate: string;
  /**
   * True when the month has not finished yet, so this is the latest published rate standing in for
   * a month-end one that does not exist. The pay figure it produces will move.
   */
  provisional: boolean;
}

function toDate(ddMmYyyy: string): Date {
  const [day, month, year] = ddMmYyyy.split('.').map(Number);
  return new Date(year, month - 1, day);
}

function asDdMmYyyy(value: Date): string {
  return [
    String(value.getDate()).padStart(2, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    value.getFullYear(),
  ].join('.');
}

/**
 * Loads the official EUR/KZT rate for a month.
 *
 * The rate the euro contract converts at is the one published for the month's last calendar day —
 * but for the month a pilot is actually flying, that day has not happened, and the bank answers a
 * future date with a feed containing no rates at all. Asking anyway would mean this never fired in
 * the one case that matters most, so a month still running falls back to the latest published rate
 * and says it is provisional.
 */
export async function fetchNbrkEurRate(
  month: string,
  request: NbrkRequest = fetch,
  today: Date = new Date(),
): Promise<NbrkEurRate> {
  const monthEnd = lastDayOfMonthDdMmYyyy(month);
  const provisional = toDate(monthEnd) > today;
  const fdate = provisional ? asDdMmYyyy(today) : monthEnd;

  const response = await request(`${NBRK_RATES_URL}?fdate=${fdate}`);
  if (!response.ok) throw new Error(`NBRK rates request failed: ${response.status}`);

  const rate = parseNbrkEurRate(await response.text());
  if (rate === undefined) throw new Error(`No EUR rate in NBRK response for ${fdate}`);

  return { rate, fdate, provisional };
}
