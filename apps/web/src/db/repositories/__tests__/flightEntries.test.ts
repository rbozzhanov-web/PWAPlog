import type { FlightLogEntry } from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../../database';
import { createPilotLogbookDb } from '../../database';
import {
  createFlightEntry,
  deleteFlightEntry,
  getFlightEntry,
  listFlightEntries,
  updateFlightEntry,
} from '../flightEntries';

function entry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'entry-1',
    date: '2026-09-10',
    departureAirport: 'UAAA',
    arrivalAirport: 'UACC',
    totalTimeMinutes: 90,
    picMinutes: 0,
    sicMinutes: 90,
    dualReceivedMinutes: 0,
    dualGivenMinutes: 0,
    soloMinutes: 0,
    dayMinutes: 90,
    nightMinutes: 0,
    actualInstrumentMinutes: 0,
    simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0,
    simulatorMinutes: 0,
    dayTakeoffs: 1,
    nightTakeoffs: 0,
    dayLandings: 1,
    nightLandings: 0,
    instrumentApproaches: 0,
    source: 'manual',
    createdAt: '2026-09-10T10:00:00.000Z',
    updatedAt: '2026-09-10T10:00:00.000Z',
    ...overrides,
  };
}

describe('flight entry repository', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('persists manual entries through create, update, list, get, and delete operations', async () => {
    db = createPilotLogbookDb('flight-entry-crud-test');
    const original = entry({ id: 'one', date: '2026-01-02' });
    const updated = entry({ id: 'one', date: '2026-01-02', remarks: 'updated' });

    await createFlightEntry(db, original);
    await updateFlightEntry(db, updated);

    await expect(getFlightEntry(db, 'one')).resolves.toEqual(updated);
    await expect(listFlightEntries(db)).resolves.toEqual([updated]);

    await deleteFlightEntry(db, 'one');

    await expect(listFlightEntries(db)).resolves.toEqual([]);
  });

  test('lists entries in descending ISO date order', async () => {
    db = createPilotLogbookDb('flight-entry-date-order-test');

    await createFlightEntry(db, entry({ id: 'old', date: '2026-01-02' }));
    await createFlightEntry(db, entry({ id: 'new', date: '2026-02-03' }));

    await expect(listFlightEntries(db)).resolves.toMatchObject([
      { id: 'new', date: '2026-02-03' },
      { id: 'old', date: '2026-01-02' },
    ]);
  });
});
