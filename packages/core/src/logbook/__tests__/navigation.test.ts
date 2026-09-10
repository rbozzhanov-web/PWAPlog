import { targetMonthForYear, yearsWithEntries, type FlightLogEntry } from '../../index';

function entry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'entry-id',
    date: '2025-01-01',
    departureAirport: 'KJFK',
    arrivalAirport: 'KLAX',
    totalTimeMinutes: 0,
    picMinutes: 0,
    sicMinutes: 0,
    dualReceivedMinutes: 0,
    dualGivenMinutes: 0,
    soloMinutes: 0,
    dayMinutes: 0,
    nightMinutes: 0,
    actualInstrumentMinutes: 0,
    simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0,
    simulatorMinutes: 0,
    dayTakeoffs: 0,
    nightTakeoffs: 0,
    dayLandings: 0,
    nightLandings: 0,
    instrumentApproaches: 0,
    source: 'manual',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('lists each entry year once in descending order', () => {
  expect(
    yearsWithEntries([
      entry({ date: '2024-12-31' }),
      entry({ date: '2025-01-01' }),
      entry({ date: '2025-12-31' }),
    ]),
  ).toEqual([2025, 2024]);
});

test('uses December as a selected year navigation target', () => {
  expect(targetMonthForYear(2024)).toBe('2024-12');
});
