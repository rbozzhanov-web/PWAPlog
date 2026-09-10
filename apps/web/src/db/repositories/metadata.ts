import type { PilotLogbookDb } from '../database';

export async function getMetadata<T>(
  db: PilotLogbookDb,
  key: string,
): Promise<T | undefined> {
  const record = await db.metadata.get(key);
  return record?.value as T | undefined;
}

export async function setMetadata<T>(
  db: PilotLogbookDb,
  key: string,
  value: T,
): Promise<string> {
  return db.metadata.put({ key, value });
}
