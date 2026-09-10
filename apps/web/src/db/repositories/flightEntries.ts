import type { FlightLogEntry } from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../database';

export async function listFlightEntries(db: PilotLogbookDb): Promise<FlightLogEntry[]> {
  return db.flightEntries.orderBy('date').reverse().toArray();
}

export async function getFlightEntry(
  db: PilotLogbookDb,
  id: string,
): Promise<FlightLogEntry | undefined> {
  return db.flightEntries.get(id);
}

export async function putFlightEntry(
  db: PilotLogbookDb,
  entry: FlightLogEntry,
): Promise<string> {
  return db.flightEntries.put(entry);
}

export async function putFlightEntries(
  db: PilotLogbookDb,
  entries: FlightLogEntry[],
): Promise<string> {
  return db.flightEntries.bulkPut(entries);
}

export async function deleteFlightEntry(db: PilotLogbookDb, id: string): Promise<void> {
  await db.flightEntries.delete(id);
}

export async function deleteImportBatch(
  db: PilotLogbookDb,
  importBatchId: string,
): Promise<void> {
  await db.flightEntries.where('importBatchId').equals(importBatchId).delete();
}
