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

  const incoming = [...new Map(result.backup.entries.map((entry) => [entry.id, entry])).values()];

  return db.transaction('rw', db.flightEntries, async () => {
    const existing = await db.flightEntries.toArray();
    const merged = mergeLogbookBackup(existing, incoming);
    await db.flightEntries.bulkPut(merged.merged);

    return {
      added: merged.added,
      updated: merged.updated,
      unchanged: merged.unchanged,
      total: incoming.length,
    };
  });
}
