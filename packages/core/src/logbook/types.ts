export interface Aircraft {
  id: string;
  registration: string;
  type: string;
  createdAt: string;
}

export type EntrySource = 'manual' | 'pdf_import';

export interface FlightLogEntry {
  id: string;
  date: string;
  flightNumber?: string;
  departureAirport: string;
  arrivalAirport: string;
  aircraftId?: string;
  aircraftType?: string;
  aircraftRegistration?: string;
  timeOut?: string;
  timeOff?: string;
  timeOn?: string;
  timeIn?: string;
  totalTimeMinutes: number;
  picMinutes: number;
  sicMinutes: number;
  dualReceivedMinutes: number;
  dualGivenMinutes: number;
  soloMinutes: number;
  dayMinutes: number;
  nightMinutes: number;
  actualInstrumentMinutes: number;
  simulatedInstrumentMinutes: number;
  crossCountryMinutes: number;
  simulatorMinutes: number;
  simulatorType?: string;
  dayTakeoffs: number;
  nightTakeoffs: number;
  dayLandings: number;
  nightLandings: number;
  instrumentApproaches: number;
  pilotInCommandName?: string;
  secondInCommandName?: string;
  otherCrewNames?: string;
  remarks?: string;
  source: EntrySource;
  importBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export const NEW_ENTRY_DEFAULTS: Pick<
  FlightLogEntry,
  | 'picMinutes'
  | 'sicMinutes'
  | 'dualReceivedMinutes'
  | 'dualGivenMinutes'
  | 'soloMinutes'
  | 'dayMinutes'
  | 'nightMinutes'
  | 'actualInstrumentMinutes'
  | 'simulatedInstrumentMinutes'
  | 'crossCountryMinutes'
  | 'simulatorMinutes'
  | 'dayTakeoffs'
  | 'nightTakeoffs'
  | 'dayLandings'
  | 'nightLandings'
  | 'instrumentApproaches'
> = {
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
};
