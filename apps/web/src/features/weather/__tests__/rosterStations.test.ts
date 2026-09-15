/// <reference types="vitest/globals" />
import { HOME_BASE, stationForDay, stationsByDay } from '../weatherService';

test('a flying day reports where the flying ended', () => {
  expect(stationForDay([{ destination: 'NQZ' }, { destination: 'FRA' }], undefined, 'ALA')).toBe('FRA');
});

test('a day with no flying reports where the pilot already is', () => {
  expect(stationForDay([], undefined, 'FRA')).toBe('FRA');
  expect(stationForDay([], 'ICN', 'FRA')).toBe('ICN');
});

// The case that made this necessary: a rest day downroute must not report the base's weather.
test('carries the station across non-flying days until a sector moves it', () => {
  const stations = stationsByDay([
    { date: '2026-09-16', flights: [{ destination: 'NQZ' }, { destination: 'FRA' }] },
    { date: '2026-09-17', flights: [], hotelStation: 'FRA' },
    { date: '2026-09-18', flights: [] },
    { date: '2026-09-19', flights: [{ destination: 'ALA' }] },
    { date: '2026-09-20', flights: [] },
  ]);

  expect(stations.get('2026-09-16')).toBe('FRA');
  expect(stations.get('2026-09-17')).toBe('FRA');
  expect(stations.get('2026-09-18')).toBe('FRA');
  expect(stations.get('2026-09-19')).toBe('ALA');
  expect(stations.get('2026-09-20')).toBe('ALA');
});

test('starts at the base before anything has moved the pilot', () => {
  expect(stationsByDay([{ date: '2026-09-01', flights: [] }]).get('2026-09-01')).toBe(HOME_BASE);
});
