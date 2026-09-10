import type {
  MonthlyDays,
  ParsedCrewSchedule,
  PaySettings,
} from '@pilot-logbook/core';

export interface SettingsRecord extends PaySettings {
  id: 'pay-settings';
}

export interface CrewScheduleRecord extends ParsedCrewSchedule {
  importedAt: string;
}

export interface ExchangeRateRecord {
  month: string;
  rate: number;
  source: 'nbrk' | 'manual';
  updatedAt: string;
}

export interface TaxableYtdOverrideRecord {
  month: string;
  taxableIncome: number;
  updatedAt: string;
}

export interface MonthlyPayDaysRecord extends MonthlyDays {
  month: string;
}

export interface MetadataRecord<T = unknown> {
  key: string;
  value: T;
}

export interface RestorePreview {
  added: number;
  updated: number;
  unchanged: number;
  total: number;
}
