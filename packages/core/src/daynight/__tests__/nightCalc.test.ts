import { calculateDayNight } from '../nightCalc';
import { findAirportCoords, resolveIcaoCode, toIcaoCode } from '../airportDb';

/**
 * Day/night is a licensing figure — it decides what a pilot may log as night time — and it runs on
 * every PDF import through the parser rules, so it is worth pinning directly rather than only
 * through a parser fixture.
 */

test('a midday sector is all day, with day takeoff and landing', () => {
  const result = calculateDayNight({
    date: '2026-06-21',
    departureAirport: 'ALA',
    arrivalAirport: 'NQZ',
    departureTime: '06:00', // 12:00 local at UTC+6, high summer
    totalTimeMinutes: 115,
  });

  expect(result).toBeDefined();
  expect(result!.nightMinutes).toBe(0);
  expect(result!.dayMinutes).toBe(115);
  expect(result!.dayTakeoffs).toBe(1);
  expect(result!.nightTakeoffs).toBe(0);
  expect(result!.dayLandings).toBe(1);
  expect(result!.nightLandings).toBe(0);
});

test('a deep-night sector is all night and keeps its exact block time', () => {
  const result = calculateDayNight({
    date: '2026-12-21',
    departureAirport: 'ALA',
    arrivalAirport: 'NQZ',
    departureTime: '18:00', // midnight local at UTC+6, midwinter
    totalTimeMinutes: 113,
  });

  expect(result).toBeDefined();
  expect(result!.nightMinutes).toBe(113);
  expect(result!.dayMinutes).toBe(0);
  expect(result!.nightTakeoffs).toBe(1);
  expect(result!.nightLandings).toBe(1);
});

// A single-condition flight keeps its exact time; rounding 113 minutes of unbroken night down to
// 110 would claim three minutes of daylight that never happened.
test('day and night always add back up to the block time', () => {
  for (const departureTime of ['00:00', '03:30', '06:00', '11:15', '14:45', '19:00', '22:30']) {
    const result = calculateDayNight({
      date: '2026-03-15',
      departureAirport: 'ALA',
      arrivalAirport: 'FRA',
      departureTime,
      totalTimeMinutes: 380,
    });

    expect(result).toBeDefined();
    expect(result!.dayMinutes + result!.nightMinutes).toBe(380);
    expect(result!.dayTakeoffs + result!.nightTakeoffs).toBe(1);
    expect(result!.dayLandings + result!.nightLandings).toBe(1);
  }
});

test('a mixed sector rounds the night figure to the logbook five-minute convention', () => {
  const result = calculateDayNight({
    date: '2026-03-15',
    departureAirport: 'ALA',
    arrivalAirport: 'FRA',
    departureTime: '01:00',
    totalTimeMinutes: 380,
  });

  expect(result).toBeDefined();
  if (result!.nightMinutes > 0 && result!.nightMinutes < 380) {
    expect(result!.nightMinutes % 5).toBe(0);
  }
});

test('returns undefined when an airport cannot be resolved', () => {
  expect(calculateDayNight({
    date: '2026-06-21',
    departureAirport: 'ZZZ',
    arrivalAirport: 'NQZ',
    departureTime: '06:00',
    totalTimeMinutes: 115,
  })).toBeUndefined();
});

test('a zero-length entry carries no time and no night', () => {
  const result = calculateDayNight({
    date: '2026-06-21',
    departureAirport: 'ALA',
    arrivalAirport: 'ALA',
    departureTime: '06:00',
    totalTimeMinutes: 0,
  });

  expect(result).toBeDefined();
  expect(result!.nightMinutes).toBe(0);
  expect(result!.dayMinutes).toBe(0);
});

test('canonicalises codes to ICAO, including the retired and mis-listed ones', () => {
  expect(toIcaoCode('ALA')).toBe('UAAA');
  expect(toIcaoCode('TSE')).toBe('UACC');
  expect(toIcaoCode('NQZ')).toBe('UACC');
  expect(toIcaoCode('FRU')).toBe('UCFM');
  expect(toIcaoCode('UAFM')).toBe('UCFM');
  expect(resolveIcaoCode('ZZZZ')).toEqual({ code: 'ZZZZ', resolved: false });
});

test('finds coordinates by either code namespace', () => {
  const byIata = findAirportCoords('ALA');
  const byIcao = findAirportCoords('UAAA');

  expect(byIata).toEqual(byIcao);
  expect(byIata!.lat).toBeCloseTo(43.35, 1);
  expect(byIata!.lon).toBeCloseTo(77.04, 1);
});
