/// <reference types="vitest/globals" />

/**
 * The bug these cover: east of Greenwich, the device's calendar day runs ahead of UTC's for the
 * last few hours of every evening. Anything that derived "today" from an ISO string was reading
 * the UTC day, so the screens disagreed with each other and with the pilot's wristwatch.
 *
 * Almaty is UTC+5, so 20:30Z on the 16th is already 01:30 on the 17th there.
 */
const ALMATY_EVENING = new Date('2026-09-16T20:30:00Z');
const ALMATY_MONTH_ROLLOVER = new Date('2026-09-30T20:30:00Z');

let originalTz: string | undefined;

beforeAll(() => {
  originalTz = process.env.TZ;
  process.env.TZ = 'Asia/Almaty';
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe('local date helpers', () => {
  it('reads the day from the device calendar, not the UTC one', async () => {
    const { localDateKey } = await import('../localDate');

    expect(ALMATY_EVENING.getUTCDate()).toBe(16);
    expect(localDateKey(ALMATY_EVENING)).toBe('2026-09-17');
    expect(ALMATY_EVENING.toISOString().slice(0, 10)).not.toBe(localDateKey(ALMATY_EVENING));
  });

  it('rolls the month over with the device, not five hours later', async () => {
    const { localMonthKey } = await import('../localDate');

    expect(localMonthKey(ALMATY_MONTH_ROLLOVER)).toBe('2026-10');
  });

  it('formats the header for the same day the roster highlights', async () => {
    const { formatLocalDateHeader, localDateKey } = await import('../localDate');

    // The header and the roster's today-key have to name one day, whichever day that is.
    expect(formatLocalDateHeader(ALMATY_EVENING)).toBe('THU, SEP 17, 26');
    expect(localDateKey(ALMATY_EVENING)).toBe('2026-09-17');
  });
});
