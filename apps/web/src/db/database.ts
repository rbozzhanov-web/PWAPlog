import type { Aircraft, FlightLogEntry } from '@pilot-logbook/core';
import Dexie, { type Table } from 'dexie';

import type {
  ExchangeRateRecord,
  MetadataRecord,
  MonthlyPayDaysRecord,
  SettingsRecord,
  TaxableYtdOverrideRecord,
} from './types';

const DEFAULT_DATABASE_NAME = 'pilot-logbook';

export class PilotLogbookDb extends Dexie {
  flightEntries!: Table<FlightLogEntry, string>;
  aircraft!: Table<Aircraft, string>;
  settings!: Table<SettingsRecord, string>;
  exchangeRates!: Table<ExchangeRateRecord, string>;
  taxableYtdOverrides!: Table<TaxableYtdOverrideRecord, string>;
  monthlyPayDays!: Table<MonthlyPayDaysRecord, string>;
  metadata!: Table<MetadataRecord, string>;

  constructor(name = DEFAULT_DATABASE_NAME) {
    super(name);

    this.version(1).stores({
      flightEntries: 'id,date,importBatchId',
      aircraft: 'id,registration',
      settings: 'id',
      crewSchedules: 'month',
      exchangeRates: 'month',
      taxableYtdOverrides: 'month',
      monthlyPayDays: 'month',
      metadata: 'key',
    });

    /**
     * Pay's own Crew Schedule PDF importer is gone: the Roster tab reads that same report, and Pay
     * now derives its day counts and sectors from the roster. This drops the table it kept its
     * parsed months in, which nothing reads any more.
     */
    this.version(2).stores({ crewSchedules: null });

    this.on('populate', () =>
      this.metadata.add({
        key: 'schema-version',
        value: 1,
      }),
    );
  }
}

export function createPilotLogbookDb(name?: string): PilotLogbookDb {
  return new PilotLogbookDb(name);
}
