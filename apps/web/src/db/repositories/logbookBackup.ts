import { mergeLogbookBackup, parseLogbookBackup } from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../database';
import type { RestorePreview } from '../types';

export async function restoreLogbookBackup(
  db: PilotLogbookDb,
  raw: string,
): Promise<RestorePreview> {
  const result = parseLogbookBackup(raw);
  if (!result.ok) {
    throw new Error(result.error);
  }

  return db.transaction('rw', db.flightEntries, async () => {
    const existing = await db.flightEntries.toArray();
    const merged = mergeLogbookBackup(existing, result.backup.entries);
    await db.flightEntries.bulkPut(merged.merged);

    return {
      added: merged.added,
      updated: merged.updated,
      unchanged: merged.unchanged,
      total: result.backup.entries.length,
    };
  });
}
