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

    await expect(fetchNbrkEurRate('2026-07', request)).resolves.toBe(544.5);
    expect(requestedUrl).toBe(
      'https://nationalbank.kz/rss/get_rates.cfm?fdate=31.07.2026',
    );
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
});
