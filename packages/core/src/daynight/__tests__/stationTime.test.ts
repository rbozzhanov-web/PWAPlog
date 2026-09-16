import { describe, expect, it } from 'vitest';

import { stationLocalToUtc, stationTimezone } from '../stationTime';

const iso = (value: Date | undefined) => value?.toISOString();

describe('stationTimezone', () => {
  it('knows the stations this roster flies', () => {
    expect(stationTimezone('NQZ')).toBe('Asia/Almaty');
    expect(stationTimezone('ALA')).toBe('Asia/Almaty');
    expect(stationTimezone('FRA')).toBe('Europe/Berlin');
  });

  it('accepts a code however it was typed, and admits what it does not know', () => {
    expect(stationTimezone(' fra ')).toBe('Europe/Berlin');
    expect(stationTimezone('ZZZ')).toBeUndefined();
  });
});

describe('stationLocalToUtc', () => {
  it('reads a printed clock at its own station', () => {
    // Kazakhstan is UTC+5 all year; Germany is on CEST (UTC+2) in September.
    expect(iso(stationLocalToUtc('2026-09-04', '12:17', 'NQZ'))).toBe('2026-09-04T07:17:00.000Z');
    expect(iso(stationLocalToUtc('2026-09-04', '16:54', 'FRA'))).toBe('2026-09-04T14:54:00.000Z');
  });

  it('applies the offset in force on the flight\'s own date, not today\'s', () => {
    // The same wall clock in Frankfurt, once either side of the October transition.
    expect(iso(stationLocalToUtc('2026-10-24', '12:00', 'FRA'))).toBe('2026-10-24T10:00:00.000Z');
    expect(iso(stationLocalToUtc('2026-10-26', '12:00', 'FRA'))).toBe('2026-10-26T11:00:00.000Z');
  });

  it('resolves a clock reading in the hour a fall-back repeats', () => {
    // 02:30 happens twice on 25 Oct 2026 in Berlin. Either instant is a defensible answer; what
    // matters is that one comes back and that it really reads 02:30 locally.
    const instant = stationLocalToUtc('2026-10-25', '02:30', 'FRA');
    expect(instant).toBeDefined();
    expect(['2026-10-25T00:30:00.000Z', '2026-10-25T01:30:00.000Z']).toContain(iso(instant));
  });

  it('reports a clock reading the zone skips rather than inventing one', () => {
    // Berlin jumps 02:00 → 03:00 on 29 March 2026, so 02:30 never happens.
    expect(stationLocalToUtc('2026-03-29', '02:30', 'FRA')).toBeUndefined();
  });

  it('returns nothing for an unknown station or an unparseable time', () => {
    expect(stationLocalToUtc('2026-09-04', '12:17', 'ZZZ')).toBeUndefined();
    expect(stationLocalToUtc('not-a-date', '12:17', 'FRA')).toBeUndefined();
  });
});
