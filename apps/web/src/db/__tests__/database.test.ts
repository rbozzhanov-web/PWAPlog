import type { PilotLogbookDb } from '../database';
import { createPilotLogbookDb } from '../database';
import { putAircraft } from '../repositories/aircraft';

describe('PilotLogbookDb', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('creates v1 tables and records the schema migration fact', async () => {
    db = createPilotLogbookDb('migration-test');
    await db.open();

    expect(db.tables.map(({ name }) => name).sort()).toEqual([
      'aircraft',
      'crewSchedules',
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
      crewSchedules: 'month',
      exchangeRates: 'month',
      taxableYtdOverrides: 'month',
      monthlyPayDays: 'month',
      metadata: 'key',
    });
    expect(await db.metadata.get('schema-version')).toMatchObject({ value: 1 });
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
