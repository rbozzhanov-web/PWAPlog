import { PUBLISHED_SECTORS } from '../normsTable';
import { lookupNormMinutes, sectorPayTime, summarisePayHours } from '../normLookup';

describe('published norms table', () => {
  it('parses every published sector', () => {
    expect(PUBLISHED_SECTORS).toHaveLength(205);
  });

  it('reads HH:MM as minutes', () => {
    // ALA -> LHR 9:38 is the longest sector on the list.
    const longest = PUBLISHED_SECTORS.find((s) => s.dep === 'ALA' && s.arr === 'LHR');

    expect(longest?.minutes).toBe(9 * 60 + 38);
  });

  it('has no duplicate sectors, which would make one row silently unreachable', () => {
    const keys = PUBLISHED_SECTORS.map((s) => `${s.dep}${s.arr}`);

    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('lookupNormMinutes', () => {
  it('finds a sector by the ICAO codes the logbook stores', () => {
    // ALA -> NQZ is 1:55; the logbook holds these as UAAA -> UACC.
    expect(lookupNormMinutes('UAAA', 'UACC')).toBe(115);
  });

  it('accepts the published IATA too', () => {
    expect(lookupNormMinutes('ALA', 'NQZ')).toBe(115);
  });

  it('resolves a retired code onto the table’s current one', () => {
    // Entries imported before 2020 hold Astana as TSE; the table publishes NQZ. Both are UACC.
    expect(lookupNormMinutes('ALA', 'TSE')).toBe(lookupNormMinutes('ALA', 'NQZ'));
  });

  it('is directional — the reverse sector is a different time, not a mirror', () => {
    expect(lookupNormMinutes('ALA', 'AUH')).toBe(5 * 60 + 15);
    expect(lookupNormMinutes('AUH', 'ALA')).toBe(4 * 60 + 16);
  });

  it('returns nothing for a sector that is not on the list', () => {
    expect(lookupNormMinutes('UAAA', 'EGLL')).toBeDefined(); // ALA-LHR is listed
    expect(lookupNormMinutes('EGLL', 'EDDF')).toBeUndefined(); // LHR-FRA is not
  });
});

describe('sectorPayTime', () => {
  it('pays a listed sector on its norm, not on what was flown', () => {
    // Published ALA -> DXB is 5:02 even if the aircraft took 5:40.
    expect(sectorPayTime('UAAA', 'OMDB', 340)).toEqual({ minutes: 302, source: 'norm' });
  });

  it('never substitutes the reverse direction, which carries a different time', () => {
    // ALA->NQZ is 1:55 and NQZ->ALA is 1:53. Borrowing one for the other would be wrong by two
    // minutes on the busiest sector in the network.
    expect(sectorPayTime('UAAA', 'UACC', 999)).toEqual({ minutes: 115, source: 'norm' });
    expect(sectorPayTime('UACC', 'UAAA', 999)).toEqual({ minutes: 113, source: 'norm' });
  });

  it('falls back to the operated time for a sector that is not on the list', () => {
    expect(sectorPayTime('EGLL', 'EDDF', 95)).toEqual({ minutes: 95, source: 'actual' });
  });
});

describe('summarisePayHours', () => {
  const sector = (departureAirport: string, arrivalAirport: string, totalTimeMinutes: number) => ({
    departureAirport,
    arrivalAirport,
    totalTimeMinutes,
  });

  it('keeps norm and actual apart rather than reporting one blended total', () => {
    const summary = summarisePayHours([
      sector('UAAA', 'UACC', 200), // ALA->NQZ published: 1:55
      sector('UACC', 'UAAA', 200), // NQZ->ALA published: 1:53
      sector('EGLL', 'EDDF', 95), // not published: actual
    ]);

    expect(summary.normMinutes).toBe(115 + 113);
    expect(summary.actualMinutes).toBe(95);
    expect(summary.totalMinutes).toBe(323);
    expect(summary).toMatchObject({ sectorsOnNorm: 2, sectorsOnActual: 1 });
  });

  it('names the unlisted sectors, so a fallback is never silent', () => {
    const summary = summarisePayHours([
      sector('EGLL', 'EDDF', 95),
      sector('EGLL', 'EDDF', 100),
      sector('UAAA', 'UACC', 120),
    ]);

    // Deduplicated: the same sector flown twice is one thing to check, not two.
    expect(summary.unlistedSectors).toEqual(['EGLL-EDDF']);
  });

  it('totals an empty month to zero rather than NaN', () => {
    expect(summarisePayHours([])).toMatchObject({ totalMinutes: 0, unlistedSectors: [] });
  });
});
