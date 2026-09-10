import {
  NEW_ENTRY_DEFAULTS,
  type FlightLogEntry,
} from '@pilot-logbook/core';

export const numericEntryFields = [
  ['totalTimeMinutes', 'Total minutes'],
  ['picMinutes', 'PIC minutes'],
  ['sicMinutes', 'SIC minutes'],
  ['dualReceivedMinutes', 'Dual received minutes'],
  ['dualGivenMinutes', 'Dual given minutes'],
  ['soloMinutes', 'Solo minutes'],
  ['dayMinutes', 'Day minutes'],
  ['nightMinutes', 'Night minutes'],
  ['actualInstrumentMinutes', 'Actual instrument minutes'],
  ['simulatedInstrumentMinutes', 'Simulated instrument minutes'],
  ['crossCountryMinutes', 'Cross-country minutes'],
  ['simulatorMinutes', 'Simulator minutes'],
  ['dayTakeoffs', 'Day takeoffs'],
  ['nightTakeoffs', 'Night takeoffs'],
  ['dayLandings', 'Day landings'],
  ['nightLandings', 'Night landings'],
  ['instrumentApproaches', 'Instrument approaches'],
] as const;

type NumericField = (typeof numericEntryFields)[number][0];

export interface ManualEntryInput extends Record<NumericField, string> {
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  flightNumber: string;
  aircraftType: string;
  aircraftRegistration: string;
  remarks: string;
  baseEntry?: FlightLogEntry;
}

export type EntryFieldErrors = Partial<Record<keyof ManualEntryInput, string>>;

export type ValidationResult =
  | { success: true; entry: FlightLogEntry }
  | { success: false; errors: EntryFieldErrors };

function optionalValue(value: string): string | undefined {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function currentDate(): string {
  const date = new Date();
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 10);
}

export function manualEntryInput(entry?: FlightLogEntry): ManualEntryInput {
  return {
    date: entry?.date ?? currentDate(),
    departureAirport: entry?.departureAirport ?? '',
    arrivalAirport: entry?.arrivalAirport ?? '',
    flightNumber: entry?.flightNumber ?? '',
    aircraftType: entry?.aircraftType ?? '',
    aircraftRegistration: entry?.aircraftRegistration ?? '',
    totalTimeMinutes: String(entry?.totalTimeMinutes ?? 0),
    picMinutes: String(entry?.picMinutes ?? NEW_ENTRY_DEFAULTS.picMinutes),
    sicMinutes: String(entry?.sicMinutes ?? NEW_ENTRY_DEFAULTS.sicMinutes),
    dualReceivedMinutes: String(
      entry?.dualReceivedMinutes ?? NEW_ENTRY_DEFAULTS.dualReceivedMinutes,
    ),
    dualGivenMinutes: String(entry?.dualGivenMinutes ?? NEW_ENTRY_DEFAULTS.dualGivenMinutes),
    soloMinutes: String(entry?.soloMinutes ?? NEW_ENTRY_DEFAULTS.soloMinutes),
    dayMinutes: String(entry?.dayMinutes ?? NEW_ENTRY_DEFAULTS.dayMinutes),
    nightMinutes: String(entry?.nightMinutes ?? NEW_ENTRY_DEFAULTS.nightMinutes),
    actualInstrumentMinutes: String(
      entry?.actualInstrumentMinutes ?? NEW_ENTRY_DEFAULTS.actualInstrumentMinutes,
    ),
    simulatedInstrumentMinutes: String(
      entry?.simulatedInstrumentMinutes ?? NEW_ENTRY_DEFAULTS.simulatedInstrumentMinutes,
    ),
    crossCountryMinutes: String(
      entry?.crossCountryMinutes ?? NEW_ENTRY_DEFAULTS.crossCountryMinutes,
    ),
    simulatorMinutes: String(entry?.simulatorMinutes ?? NEW_ENTRY_DEFAULTS.simulatorMinutes),
    dayTakeoffs: String(entry?.dayTakeoffs ?? NEW_ENTRY_DEFAULTS.dayTakeoffs),
    nightTakeoffs: String(entry?.nightTakeoffs ?? NEW_ENTRY_DEFAULTS.nightTakeoffs),
    dayLandings: String(entry?.dayLandings ?? NEW_ENTRY_DEFAULTS.dayLandings),
    nightLandings: String(entry?.nightLandings ?? NEW_ENTRY_DEFAULTS.nightLandings),
    instrumentApproaches: String(
      entry?.instrumentApproaches ?? NEW_ENTRY_DEFAULTS.instrumentApproaches,
    ),
    remarks: entry?.remarks ?? '',
    baseEntry: entry,
  };
}

export function validateManualEntry(input: ManualEntryInput): ValidationResult {
  const errors: EntryFieldErrors = {};

  if (!input.date) {
    errors.date = 'Date is required';
  }
  if (!input.departureAirport.trim()) {
    errors.departureAirport = 'Departure is required';
  }
  if (!input.arrivalAirport.trim()) {
    errors.arrivalAirport = 'Arrival is required';
  }

  const numericValues = {} as Record<NumericField, number>;
  for (const [field, label] of numericEntryFields) {
    const rawValue = input[field].trim();
    const value = Number(rawValue);
    if (rawValue === '') {
      errors[field] = `${label} is required`;
    } else if (!Number.isFinite(value) || value < 0) {
      errors[field] = `${label} must be zero or greater`;
    } else {
      numericValues[field] = value;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const timestamp = new Date().toISOString();
  const baseEntry = input.baseEntry;
  return {
    success: true,
    entry: {
      ...baseEntry,
      id: baseEntry?.id ?? crypto.randomUUID(),
      date: input.date,
      departureAirport: input.departureAirport.trim().toUpperCase(),
      arrivalAirport: input.arrivalAirport.trim().toUpperCase(),
      flightNumber: optionalValue(input.flightNumber),
      aircraftType: optionalValue(input.aircraftType),
      aircraftRegistration: optionalValue(input.aircraftRegistration)?.toUpperCase(),
      ...numericValues,
      remarks: optionalValue(input.remarks),
      source: baseEntry?.source ?? 'manual',
      createdAt: baseEntry?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}
