import {
  BACKUP_APP_ID,
  BACKUP_FORMAT_VERSION,
  buildLogbookBackup,
  mergeLogbookBackup,
  parseLogbookBackup,
  serializeLogbookBackup,
} from '../logbook';
import type { FlightLogEntry } from '../../logbook/types';

function entry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'e1',
    date: '2018-04-23',
    departureAirport: 'UAAA',
    arrivalAirport: 'UACC',
    aircraftType: 'A320',
    aircraftRegistration: 'P4-KBE',
    timeOut: '03:15',
    timeIn: '05:00',
    totalTimeMinutes: 105,
    picMinutes: 0,
    sicMinutes: 105,
    dualReceivedMinutes: 0,
    dualGivenMinutes: 0,
    soloMinutes: 0,
    dayMinutes: 105,
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
    pilotInCommandName: 'KISSELEV ALEXANDR',
    source: 'pdf_import',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const nativeV1Backup = {
  app: 'pilot-logbook',
  formatVersion: 1,
  exportedAt: '2026-08-25T10:00:00.000Z',
  entryCount: 1,
  entries: [entry({ id: 'native-id', createdAt: '2025-01-01T00:00:00.000Z' })],
};

describe('native v1 logbook backup compatibility', () => {
  test('accepts and preserves a native v1 backup entry ID and audit fields', () => {
    const result = parseLogbookBackup(JSON.stringify(nativeV1Backup));

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.backup.entries[0]).toMatchObject({
        id: 'native-id',
        createdAt: '2025-01-01T00:00:00.000Z',
      });
    }
  });

  test('merges by ID without deleting local flights or duplicating a repeated restore', () => {
    const first = mergeLogbookBackup([entry({ id: 'local' })], [entry({ id: 'native-id' })]);
    const second = mergeLogbookBackup(first.merged, [entry({ id: 'native-id' })]);

    expect(first).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
    expect(second).toMatchObject({ added: 0, updated: 0, unchanged: 1 });
    expect(second.merged.map(({ id }) => id)).toEqual(expect.arrayContaining(['local', 'native-id']));
  });

  test('uses the native app ID, format version, and entry count', () => {
    expect(BACKUP_APP_ID).toBe('pilot-logbook');
    expect(buildLogbookBackup([entry()], '2026-08-25T10:00:00.000Z')).toMatchObject({
      formatVersion: BACKUP_FORMAT_VERSION,
      entryCount: 1,
      exportedAt: '2026-08-25T10:00:00.000Z',
    });
  });

  test('serializes native backups with two-space indentation', () => {
    expect(serializeLogbookBackup([entry()], '2026-08-25T10:00:00.000Z')).toBe(
      JSON.stringify(buildLogbookBackup([entry()], '2026-08-25T10:00:00.000Z'), null, 2),
    );
  });

  test('fills omitted native counter fields with zero', () => {
    const { simulatorMinutes, ...olderEntry } = entry();
    const result = parseLogbookBackup(JSON.stringify({ ...nativeV1Backup, entries: [olderEntry] }));

    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.backup.entries[0]?.simulatorMinutes).toBe(0);
  });

  test('returns native safe errors for invalid JSON, malformed entries, and future formats', () => {
    expect(parseLogbookBackup('%PDF-1.4')).toEqual({ ok: false, error: 'That file is not valid JSON.' });

    const malformed = parseLogbookBackup(JSON.stringify({ ...nativeV1Backup, entries: [entry({ date: '23/04/2018' })] }));
    expect(malformed).toMatchObject({ ok: false });
    if (!malformed.ok) expect(malformed.error).toContain('entries.0.date');

    const future = parseLogbookBackup(JSON.stringify({ ...nativeV1Backup, formatVersion: 2, entries: [] }));
    expect(future).toMatchObject({ ok: false });
    if (!future.ok) expect(future.error).toMatch(/newer version of the app/);
  });
});
