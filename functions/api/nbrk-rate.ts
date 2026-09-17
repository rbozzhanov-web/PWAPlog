/**
 * Same-origin proxy for the National Bank of Kazakhstan's exchange-rate feed.
 *
 * nationalbank.kz returns no `Access-Control-Allow-Origin`, so a browser refuses to let this app
 * read the feed however the request is phrased. A Pages Function is served from the app's own
 * origin, so there is no cross-origin request to refuse.
 *
 * It forwards the XML untouched rather than extracting the rate here, which keeps `parseNbrkEurRate`
 * in core as the single parser — one implementation, one set of tests, used by the client either
 * way.
 *
 * Not an open proxy: the only thing a caller controls is a date, and it must look like DD.MM.YYYY
 * before it is used. The upstream URL is otherwise fixed.
 */

const NBRK_RATES_URL = 'https://nationalbank.kz/rss/get_rates.cfm';
const DDMMYYYY = /^\d{2}\.\d{2}\.\d{4}$/;

/** A rate for a day that has closed never changes, so it can be cached hard. */
const CACHE_CONTROL = 'public, max-age=21600, stale-while-revalidate=86400';

interface ProxyContext {
  request: { url: string };
}

export async function handleNbrkRate(
  { request }: ProxyContext,
  upstream: typeof fetch = fetch,
): Promise<Response> {
  const fdate = new URL(request.url).searchParams.get('fdate') ?? '';
  if (!DDMMYYYY.test(fdate)) {
    return new Response('Expected fdate=DD.MM.YYYY', { status: 400, headers: { 'content-type': 'text/plain' } });
  }

  let response: Response;
  try {
    response = await upstream(`${NBRK_RATES_URL}?fdate=${fdate}`);
  } catch {
    // The bank being unreachable is not this app's fault, and the pilot can still type the rate.
    return new Response('Could not reach the National Bank of Kazakhstan.', { status: 502, headers: { 'content-type': 'text/plain' } });
  }
  if (!response.ok) {
    return new Response(`National Bank returned ${response.status}.`, { status: 502, headers: { 'content-type': 'text/plain' } });
  }

  return new Response(await response.text(), {
    status: 200,
    headers: { 'content-type': 'text/xml; charset=utf-8', 'cache-control': CACHE_CONTROL },
  });
}

export const onRequestGet = (context: ProxyContext) => handleNbrkRate(context);
