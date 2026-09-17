import { describe, expect, it, vi } from 'vitest';

import { handleNbrkRate } from '../api/nbrk-rate';

const FEED = `<?xml version="1.0" encoding="utf-8"?><rates>
  <item><fullname>Euro</fullname><title>EUR</title><description>541.36</description><quant>1</quant></item>
</rates>`;

const call = (url: string, upstream: unknown) =>
  handleNbrkRate({ request: { url } }, upstream as typeof fetch);

describe('the National Bank rate proxy', () => {
  it('forwards the feed untouched, so core stays the only parser', async () => {
    const upstream = vi.fn(async () => new Response(FEED, { status: 200 }));

    const response = await call('https://app.test/api/nbrk-rate?fdate=31.08.2026', upstream);

    expect(upstream).toHaveBeenCalledWith('https://nationalbank.kz/rss/get_rates.cfm?fdate=31.08.2026');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(FEED);
    expect(response.headers.get('cache-control')).toContain('max-age=');
  });

  it('refuses anything that is not a date, so it cannot be used as an open proxy', async () => {
    const upstream = vi.fn();

    for (const fdate of ['', 'yesterday', '2026-08-31', '31.08.2026&x=1', '../../etc/passwd']) {
      const response = await call(`https://app.test/api/nbrk-rate?fdate=${encodeURIComponent(fdate)}`, upstream);
      expect(response.status).toBe(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('reports the bank being unreachable rather than throwing', async () => {
    const offline = vi.fn(async () => { throw new Error('ENOTFOUND'); });

    const response = await call('https://app.test/api/nbrk-rate?fdate=31.08.2026', offline);

    expect(response.status).toBe(502);
    expect(await response.text()).toMatch(/National Bank/);
  });

  it('passes on an upstream failure as a gateway error', async () => {
    const failing = vi.fn(async () => new Response('nope', { status: 503 }));

    const response = await call('https://app.test/api/nbrk-rate?fdate=31.08.2026', failing);

    expect(response.status).toBe(502);
  });
});
