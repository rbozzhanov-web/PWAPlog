import { fetchNbrkEurRate } from '../nbrkRate';

describe('NBRK browser adapter', () => {
  test('loads the last calendar day and parses the EUR rate', async () => {
    let requestedUrl: string | undefined;
    const request = async (url: string) => {
      requestedUrl = url;
      return {
        ok: true,
        status: 200,
        text: async () =>
          '<item><title>EUR</title><description>544.5</description><quant>1</quant></item>',
      };
    };

    // A month that has already closed: the rate is the one for its last calendar day.
    await expect(fetchNbrkEurRate('2026-07', request, new Date(2026, 8, 17))).resolves.toEqual({
      rate: 544.5, fdate: '31.07.2026', provisional: false,
    });
    // This app's own proxy, not nationalbank.kz: the bank's feed sends no Access-Control-Allow-Origin,
    // so a browser will not let the app read a response fetched straight from it.
    expect(requestedUrl).toBe('/api/nbrk-rate?fdate=31.07.2026');
  });

  test('rejects a response without an EUR rate', async () => {
    const request = async () => ({
      ok: true,
      status: 200,
      text: async () =>
        '<item><title>USD</title><description>474.2</description><quant>1</quant></item>',
    });

    await expect(fetchNbrkEurRate('2026-07', request)).rejects.toThrow(
      'No EUR rate in NBRK response for 31.07.2026',
    );
  });

  /**
   * The month a pilot is actually flying has not ended, and the bank answers a future date with a
   * feed carrying no rates at all — so asking for the month's last day would make this fail in the
   * one case that matters most.
   */
  test('falls back to today for a month still running, and says it is provisional', async () => {
    let requestedUrl: string | undefined;
    const request = async (url: string) => {
      requestedUrl = url;
      return { ok: true, status: 200, text: async () => '<item><title>EUR</title><description>541.36</description><quant>1</quant></item>' };
    };

    await expect(fetchNbrkEurRate('2026-09', request, new Date(2026, 8, 17))).resolves.toEqual({
      rate: 541.36, fdate: '17.09.2026', provisional: true,
    });
    expect(requestedUrl).toBe('/api/nbrk-rate?fdate=17.09.2026');
  });

  test('treats the final day of the month as settled, not provisional', async () => {
    const request = async () => ({ ok: true, status: 200, text: async () => '<item><title>EUR</title><description>540</description><quant>1</quant></item>' });

    await expect(fetchNbrkEurRate('2026-09', request, new Date(2026, 8, 30))).resolves.toMatchObject({
      fdate: '30.09.2026', provisional: false,
    });
  });
});
