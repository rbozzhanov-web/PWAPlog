import { lastDayOfMonthDdMmYyyy, parseNbrkEurRate } from '@pilot-logbook/core';

const NBRK_RATES_URL = 'https://nationalbank.kz/rss/get_rates.cfm';

interface NbrkResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type NbrkRequest = (url: string) => Promise<NbrkResponse>;

/** Loads the official EUR/KZT rate through the browser's network adapter. */
export async function fetchNbrkEurRate(
  month: string,
  request: NbrkRequest = fetch,
): Promise<number> {
  const fdate = lastDayOfMonthDdMmYyyy(month);
  const response = await request(`${NBRK_RATES_URL}?fdate=${fdate}`);
  if (!response.ok) throw new Error(`NBRK rates request failed: ${response.status}`);

  const rate = parseNbrkEurRate(await response.text());
  if (rate === undefined) throw new Error(`No EUR rate in NBRK response for ${fdate}`);

  return rate;
}
