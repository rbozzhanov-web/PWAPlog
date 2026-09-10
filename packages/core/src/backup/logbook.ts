import { z } from 'zod';

import type { FlightLogEntry } from '../logbook/types';

export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_APP_ID = 'pilot-logbook';
export const BACKUP_FILE_NAME = 'pilot-logbook-backup.json';

const minutes = z.number().int().min(0).default(0);
const count = z.number().int().min(0).default(0);
const optionalText = z.string().optional();

const entrySchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  flightNumber: optionalText,
  departureAirport: z.string(),
  arrivalAirport: z.string(),
  aircraftId: optionalText,
  aircraftType: optionalText,
  aircraftRegistration: optionalText,
  timeOut: optionalText,
  timeOff: optionalText,
  timeOn: optionalText,
  timeIn: optionalText,
  totalTimeMinutes: minutes,
  picMinutes: minutes,
  sicMinutes: minutes,
  dualReceivedMinutes: minutes,
  dualGivenMinutes: minutes,
  soloMinutes: minutes,
  dayMinutes: minutes,
  nightMinutes: minutes,
  actualInstrumentMinutes: minutes,
  simulatedInstrumentMinutes: minutes,
  crossCountryMinutes: minutes,
  simulatorMinutes: minutes,
  simulatorType: optionalText,
  dayTakeoffs: count,
  nightTakeoffs: count,
  dayLandings: count,
  nightLandings: count,
  instrumentApproaches: count,
  pilotInCommandName: optionalText,
  secondInCommandName: optionalText,
  otherCrewNames: optionalText,
  remarks: optionalText,
  source: z.enum(['manual', 'pdf_import']).default('manual'),
  importBatchId: optionalText,
  createdAt: z.string(),
  updatedAt: z.string(),
});

const backupSchema = z.object({
  app: z.literal(BACKUP_APP_ID),
  formatVersion: z.number().int(),
  exportedAt: z.string(),
  entryCount: z.number().int().min(0),
  entries: z.array(entrySchema),
});

export type LogbookBackup = z.infer<typeof backupSchema> & { entries: FlightLogEntry[] };

export function buildLogbookBackup(
  entries: FlightLogEntry[],
  exportedAt = new Date().toISOString(),
): LogbookBackup {
  return {
    app: BACKUP_APP_ID,
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt,
    entryCount: entries.length,
    entries,
  };
}

export function serializeLogbookBackup(entries: FlightLogEntry[], exportedAt?: string): string {
  return JSON.stringify(buildLogbookBackup(entries, exportedAt), null, 2);
}

export type LogbookBackupParseResult =
  | { ok: true; backup: LogbookBackup }
  | { ok: false; error: string };

export function parseLogbookBackup(raw: string): LogbookBackupParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join('.')})` : '';
    return { ok: false, error: `That file is not a Pilot Logbook backup${where}.` };
  }

  if (parsed.data.formatVersion > BACKUP_FORMAT_VERSION) {
    return {
      ok: false,
      error: `This backup was written by a newer version of the app (format ${parsed.data.formatVersion}). Update Pilot Logbook and try again.`,
    };
  }

  return { ok: true, backup: parsed.data as LogbookBackup };
}

export interface MergeLogbookBackupResult {
  merged: FlightLogEntry[];
  added: number;
  updated: number;
  unchanged: number;
}

export function mergeLogbookBackup(
  existing: FlightLogEntry[],
  incoming: FlightLogEntry[],
): MergeLogbookBackupResult {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const entry of incoming) {
    const current = byId.get(entry.id);
    if (!current) {
      added += 1;
      byId.set(entry.id, entry);
    } else if (JSON.stringify(current) === JSON.stringify(entry)) {
      unchanged += 1;
    } else {
      updated += 1;
      byId.set(entry.id, entry);
    }
  }

  return { merged: [...byId.values()], added, updated, unchanged };
}
