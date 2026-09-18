import Dexie from 'dexie';

import type { PilotLogbookDb } from '../database';
import { createPilotLogbookDb } from '../database';
import { putAircraft } from '../repositories/aircraft';

describe('PilotLogbookDb', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('creates the current tables and records the schema migration fact', async () => {
    db = createPilotLogbookDb('migration-test');
    await db.open();

    expect(db.tables.map(({ name }) => name).sort()).toEqual([
      'aircraft',
      'exchangeRates',
      'flightEntries',
      'metadata',
      'monthlyPayDays',
      'settings',
      'taxableYtdOverrides',
    ]);
    expect(
      Object.fromEntries(
        db.tables.map((table) => [
          table.name,
          [table.schema.primKey.src, ...table.schema.indexes.map(({ src }) => src)].join(','),
        ]),
      ),
    ).toEqual({
      flightEntries: 'id,date,importBatchId',
      aircraft: 'id,registration',
      settings: 'id',
      exchangeRates: 'month',
      taxableYtdOverrides: 'month',
      monthlyPayDays: 'month',
      metadata: 'key',
    });
    expect(await db.metadata.get('schema-version')).toMatchObject({ value: 1 });
  });

  // Pay's own Crew Schedule PDF importer is gone, and so is the table it wrote to. A database
  // created before that has the table; opening it must drop that one store and carry the rest,
  // because everything else in it — the logbook, the saved rates, the pay settings — is the
  // pilot's only copy.
  test('drops the retired crew-schedule store from a database that already has it', async () => {
    const legacy = new Dexie('retired-store-test');
    legacy.version(1).stores({
      flightEntries: 'id,date,importBatchId', aircraft: 'id,registration', settings: 'id',
      crewSchedules: 'month', exchangeRates: 'month', taxableYtdOverrides: 'month',
      monthlyPayDays: 'month', metadata: 'key',
    });
    await legacy.open();
    await legacy.table('crewSchedules').put({ month: '2026-06', days: {}, sectors: [] });
    await legacy.table('exchangeRates').put({ month: '2026-06', rate: 500, source: 'manual', updatedAt: '2026-06-30T00:00:00.000Z' });
    legacy.close();

    db = createPilotLogbookDb('retired-store-test');
    await db.open();

    expect(db.tables.map(({ name }) => name)).not.toContain('crewSchedules');
    expect(await db.exchangeRates.get('2026-06')).toMatchObject({ rate: 500 });
  });

  test('prevents concurrent aircraft writes from duplicating a registration', async () => {
    db = createPilotLogbookDb('aircraft-registration-test');
    const createdAt = '2026-09-10T10:00:00.000Z';

    const results = await Promise.allSettled([
      putAircraft(db, { id: 'aircraft-1', registration: 'P4-KBE', type: 'A320', createdAt }),
      putAircraft(db, { id: 'aircraft-2', registration: 'P4-KBE', type: 'A320', createdAt }),
    ]);

    expect(results.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await db.aircraft.count()).toBe(1);
  });
});
