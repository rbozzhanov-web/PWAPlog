import type { Aircraft, FlightLogEntry } from '@pilot-logbook/core';
import Dexie, { type Table } from 'dexie';

import type {
  CrewScheduleRecord,
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
  crewSchedules!: Table<CrewScheduleRecord, string>;
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
