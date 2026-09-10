import type { Aircraft } from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../database';

export async function listAircraft(db: PilotLogbookDb): Promise<Aircraft[]> {
  return db.aircraft.orderBy('registration').toArray();
}

export async function getAircraft(
  db: PilotLogbookDb,
  id: string,
): Promise<Aircraft | undefined> {
  return db.aircraft.get(id);
}

export async function putAircraft(db: PilotLogbookDb, aircraft: Aircraft): Promise<string> {
  return db.transaction('rw', db.aircraft, async () => {
    const duplicate = await db.aircraft.where('registration').equals(aircraft.registration).first();
    if (duplicate && duplicate.id !== aircraft.id) {
      throw new Error(`Aircraft registration ${aircraft.registration} already exists.`);
    }

    return db.aircraft.put(aircraft);
  });
}

export async function deleteAircraft(db: PilotLogbookDb, id: string): Promise<void> {
  await db.aircraft.delete(id);
}
