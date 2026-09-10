import { serializeLogbookBackup, type FlightLogEntry } from '@pilot-logbook/core';
import { fireEvent, render, screen } from '@testing-library/react';

import type { PilotLogbookDb } from '../../../db/database';
import { createPilotLogbookDb } from '../../../db/database';
import { BackupImportPanel } from '../BackupImportPanel';

const backupEntry: FlightLogEntry = {
  id: 'entry-1',
  date: '2026-09-10',
  departureAirport: 'UAAA',
  arrivalAirport: 'UACC',
  totalTimeMinutes: 90,
  picMinutes: 0,
  sicMinutes: 90,
  dualReceivedMinutes: 0,
  dualGivenMinutes: 0,
  soloMinutes: 0,
  dayMinutes: 90,
  nightMinutes: 0,
  actualInstrumentMinutes: 0,
  simulatedInstrumentMinutes: 0,
  crossCountryMinutes: 0,
  simulatorMinutes: 0,
  dayTakeoffs: 1,
  nightTakeoffs: 0,
  dayLandings: 1,
  nightLandings: 0,
  instrumentApproaches: 0,
  source: 'manual',
  createdAt: '2026-09-10T10:00:00.000Z',
  updatedAt: '2026-09-10T10:00:00.000Z',
};

function uploadFile(body: string): File {
  const file = new File([body], 'pilot-logbook-backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => body });
  fireEvent.change(screen.getByLabelText('Choose PilotLogbook backup'), {
    target: { files: [file] },
  });
  return file;
}

describe('BackupImportPanel', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('shows a native backup merge preview and writes only after confirmation', async () => {
    db = createPilotLogbookDb('backup-import-panel-test');
    const validBackupJson = serializeLogbookBackup(
      [backupEntry],
      '2026-09-10T12:00:00.000Z',
    );
    render(<BackupImportPanel db={db} />);

    uploadFile(validBackupJson);

    expect(await screen.findByText('1 flight will be added')).toBeVisible();
    expect(await db.flightEntries.count()).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 flight' }));

    expect(await screen.findByText('Backup imported')).toBeVisible();
    expect(await db.flightEntries.count()).toBe(1);
  });

  test('shows a validation error without presenting an import action', async () => {
    db = createPilotLogbookDb('invalid-backup-import-panel-test');
    render(<BackupImportPanel db={db} />);

    uploadFile('{bad json');

    expect(await screen.findByRole('alert')).toHaveTextContent('not valid JSON');
    expect(screen.queryByRole('button', { name: /^Import/ })).not.toBeInTheDocument();
    expect(await db.flightEntries.count()).toBe(0);
  });
});
