import {
  mergeLogbookBackup,
  parseLogbookBackup,
  serializeLogbookBackup,
  type FlightLogEntry,
} from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../database';
import type { RestorePreview } from '../types';

interface PreparedRestore {
  entries: FlightLogEntry[];
  preview: RestorePreview;
}

async function prepareLogbookRestore(
  db: PilotLogbookDb,
  raw: string,
): Promise<PreparedRestore> {
  const result = parseLogbookBackup(raw);
  if (!result.ok) {
    throw new Error(result.error);
  }

  const incoming = [...new Map(result.backup.entries.map((entry) => [entry.id, entry])).values()];
  const merged = mergeLogbookBackup(await db.flightEntries.toArray(), incoming);

  return {
    entries: merged.merged,
    preview: {
      added: merged.added,
      updated: merged.updated,
      unchanged: merged.unchanged,
      total: incoming.length,
    },
  };
}

export async function previewLogbookBackup(
  db: PilotLogbookDb,
  raw: string,
): Promise<RestorePreview> {
  return (await prepareLogbookRestore(db, raw)).preview;
}

export async function exportLogbookBackup(db: PilotLogbookDb): Promise<string> {
  return serializeLogbookBackup(await db.flightEntries.toArray());
}

export async function restoreLogbookBackup(
  db: PilotLogbookDb,
  raw: string,
): Promise<RestorePreview> {
  return db.transaction('rw', db.flightEntries, async () => {
    const prepared = await prepareLogbookRestore(db, raw);
    await db.flightEntries.bulkPut(prepared.entries);
    return prepared.preview;
  });
}
