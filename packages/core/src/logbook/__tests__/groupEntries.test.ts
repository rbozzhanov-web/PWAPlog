import { groupEntries, type FlightLogEntry } from '../../index';

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

test('groups flights by descending YYYY-MM and sorts each group by date', () => {
  const groups = groupEntries([
    entry({ id: 'a', date: '2025-01-02' }),
    entry({ id: 'b', date: '2025-02-01' }),
    entry({ id: 'c', date: '2025-01-31' }),
  ]);

  expect(groups.map(({ month }) => month)).toEqual(['2025-02', '2025-01']);
  expect(groups[1].entries.map(({ id }) => id)).toEqual(['c', 'a']);
});
