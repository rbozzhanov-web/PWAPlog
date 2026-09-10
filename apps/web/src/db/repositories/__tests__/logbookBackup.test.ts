import { serializeLogbookBackup, type FlightLogEntry } from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../../database';
import { createPilotLogbookDb } from '../../database';
import { restoreLogbookBackup } from '../logbookBackup';

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

describe('restoreLogbookBackup', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('does not write any entries when a backup is invalid', async () => {
    db = createPilotLogbookDb('invalid-restore-test');
    const existing = entry({ id: 'existing-entry' });
    await db.flightEntries.add(existing);

    await expect(restoreLogbookBackup(db, '{bad json')).rejects.toThrow('not valid JSON');
    expect(await db.flightEntries.toArray()).toEqual([existing]);
  });

  test('merges a valid backup and reports repeated entries as unchanged', async () => {
    db = createPilotLogbookDb('repeated-restore-test');
    const raw = serializeLogbookBackup([entry()], '2026-09-10T12:00:00.000Z');

    await expect(restoreLogbookBackup(db, raw)).resolves.toEqual({
      added: 1,
      updated: 0,
      unchanged: 0,
      total: 1,
    });
    await expect(restoreLogbookBackup(db, raw)).resolves.toEqual({
      added: 0,
      updated: 0,
      unchanged: 1,
      total: 1,
    });
    expect(await db.flightEntries.toArray()).toEqual([entry()]);
  });

  test('canonicalizes duplicate backup IDs so a repeated restore is unchanged', async () => {
    db = createPilotLogbookDb('duplicate-id-restore-test');
    const finalEntry = entry({ remarks: 'B' });
    const raw = serializeLogbookBackup(
      [entry({ remarks: 'A' }), finalEntry],
      '2026-09-10T12:00:00.000Z',
    );

    await expect(restoreLogbookBackup(db, raw)).resolves.toEqual({
      added: 1,
      updated: 0,
      unchanged: 0,
      total: 1,
    });
    await expect(restoreLogbookBackup(db, raw)).resolves.toEqual({
      added: 0,
      updated: 0,
      unchanged: 1,
      total: 1,
    });
    expect(await db.flightEntries.toArray()).toEqual([finalEntry]);
  });
});
