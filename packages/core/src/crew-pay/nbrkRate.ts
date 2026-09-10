/**
 * The National Bank of Kazakhstan's official EUR/KZT rate, fetched for a given month's last
 * calendar day — that is the rate the company actually converts the euro contract at, not the
 * rate on any other day of the month.
 *
 * The feed is undocumented (no published API, no key) but public and free — it is what
 * nationalbank.kz's own site widget calls: https://nationalbank.kz/rss/get_rates.cfm?fdate=DD.MM.YYYY.
 * NBRK computes the cross-rate from the prior business day's KASE session but publishes it under
 * the CURRENT date, and a weekend/holiday's feed simply carries the last business day's number
 * forward under that same date — so querying with `fdate` = the exact date wanted is correct, no
 * separate backward-fallback loop is needed here.
 */

const NBRK_RATES_URL = 'https://nationalbank.kz/rss/get_rates.cfm';

/** "2026-07" -> "31.07.2026", the last calendar day of that month. */
export function lastDayOfMonthDdMmYyyy(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  const lastDay = new Date(year, monthNumber, 0).getDate();

  const dd = String(lastDay).padStart(2, '0');
  const mm = String(monthNumber).padStart(2, '0');
  return `${dd}.${mm}.${year}`;
}

/**
 * Extracts the EUR rate from an NBRK `get_rates.cfm` XML response.
 *
 * Splits into `<item>` blocks first and only then looks inside each block for its `<title>`, so
 * "EUR" appearing as a substring of some other currency's `<fullname>` can never be mistaken for
 * the EUR item itself. Returns undefined rather than throwing when the feed has no EUR entry —
 * malformed input is a fetch-layer concern, not this function's.
 */
export function parseNbrkEurRate(xml: string): number | undefined {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  for (const item of items) {
    const title = item.match(/<title>([^<]*)<\/title>/)?.[1];
    if (title !== 'EUR') continue;

    const description = item.match(/<description>([^<]*)<\/description>/)?.[1];
    const quant = item.match(/<quant>([^<]*)<\/quant>/)?.[1] ?? '1';

    const value = Number(description);
    const unit = Number(quant);
    if (!Number.isFinite(value) || !Number.isFinite(unit) || unit === 0) return undefined;

    return value / unit;
  }

  return undefined;
}

/**
 * Fetches the official EUR/KZT rate for a month's last calendar day. Throws on a network failure
 * or a response with no EUR entry — callers treat that exactly like a rate nobody has typed in.
 */
export async function fetchNbrkEurRate(month: string): Promise<number> {
  const fdate = lastDayOfMonthDdMmYyyy(month);
  const response = await fetch(`${NBRK_RATES_URL}?fdate=${fdate}`);
  if (!response.ok) throw new Error(`NBRK rates request failed: ${response.status}`);

  const xml = await response.text();
  const rate = parseNbrkEurRate(xml);
  if (rate === undefined) throw new Error(`No EUR rate in NBRK response for ${fdate}`);

  return rate;
}
