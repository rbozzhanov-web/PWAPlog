import {
  isAirportCodeToken,
  isTimeToken,
  parseDateDdMmYy,
  parseDateDdMmYyyy,
  REGISTRATION_RE,
} from '../patterns';

describe('parseDateDdMmYy', () => {
  it('parses DD/MM/YY into ISO with a 20YY century', () => {
    expect(parseDateDdMmYy('02/07/26')).toBe('2026-07-02');
    expect(parseDateDdMmYy('30/07/26')).toBe('2026-07-30');
  });

  it('rejects non-matching tokens', () => {
    expect(parseDateDdMmYy('NQZ')).toBeNull();
    expect(parseDateDdMmYy('2026-07-02')).toBeNull();
    expect(parseDateDdMmYy('02/07/2026')).toBeNull();
  });
});

describe('parseDateDdMmYyyy', () => {
  it('parses DD/MM/YYYY into ISO', () => {
    expect(parseDateDdMmYyyy('02/07/2026')).toBe('2026-07-02');
  });

  it('rejects a 2-digit year', () => {
    expect(parseDateDdMmYyyy('02/07/26')).toBeNull();
  });
});

describe('isTimeToken', () => {
  it('accepts valid HH:MM tokens', () => {
    expect(isTimeToken('07:04')).toBe(true);
    expect(isTimeToken('23:59')).toBe(true);
    expect(isTimeToken('00:00')).toBe(true);
  });

  it('rejects malformed tokens', () => {
    expect(isTimeToken('24:00')).toBe(false);
    expect(isTimeToken('7:4')).toBe(false);
    expect(isTimeToken('EI-KEC')).toBe(false);
  });
});

describe('isAirportCodeToken', () => {
  it('accepts 3-letter IATA and 4-letter ICAO codes', () => {
    expect(isAirportCodeToken('NQZ')).toBe(true);
    expect(isAirportCodeToken('UACC')).toBe(true);
  });

  it('rejects times, numbers, and registrations', () => {
    expect(isAirportCodeToken('07:04')).toBe(false);
    expect(isAirportCodeToken('763')).toBe(false);
    expect(isAirportCodeToken('EI-KEC')).toBe(false);
  });
});

describe('REGISTRATION_RE', () => {
  it('matches typical tail numbers', () => {
    expect(REGISTRATION_RE.test('EI-KEC')).toBe(true);
    expect(REGISTRATION_RE.test('N12345')).toBe(false); // no hyphen — not this report's style
  });
});
