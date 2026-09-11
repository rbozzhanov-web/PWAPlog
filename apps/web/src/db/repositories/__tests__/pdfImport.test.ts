import { NEW_ENTRY_DEFAULTS, type FlightLogEntry, type ParsedCandidate } from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../../database';
import { createPilotLogbookDb } from '../../database';
import {
  importApprovedPdfCandidates,
  preparePdfImportCandidates,
} from '../pdfImport';

function storedEntry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'existing-entry',
    date: '2026-07-02',
    departureAirport: 'UACC',
    arrivalAirport: 'EDDF',
    aircraftRegistration: 'EI-KEC',
    timeOut: '07:04',
    totalTimeMinutes: 457,
    ...NEW_ENTRY_DEFAULTS,
    source: 'manual',
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function parsedCandidate(overrides: Partial<FlightLogEntry> = {}): ParsedCandidate {
  return {
    rawSourceLine: '02.07.2026 UACC EDDF EI-KEC 07:04 14:41',
    confidence: 'high',
    unmatchedFields: [],
    fields: {
      date: '2026-07-02',
      departureAirport: 'UACC',
      arrivalAirport: 'EDDF',
      aircraftRegistration: 'EI-KEC',
      timeOut: '07:04',
      totalTimeMinutes: 457,
      ...NEW_ENTRY_DEFAULTS,
      source: 'pdf_import',
      ...overrides,
    },
  };
}

describe('PDF import repository', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('prepares typed review drafts with core duplicates defaulted to unapproved and performs no writes', async () => {
    db = createPilotLogbookDb('pdf-import-prepare-test');
    await db.flightEntries.add(storedEntry());

    const candidates = await preparePdfImportCandidates(db, [
      parsedCandidate(),
      parsedCandidate({ aircraftRegistration: 'EI-KEB' }),
    ]);

    expect(candidates).toMatchObject([
      {
        isDuplicate: true,
        approved: false,
        fields: {
          date: '2026-07-02',
          departureAirport: 'UACC',
          arrivalAirport: 'EDDF',
          totalTimeMinutes: 457,
        },
      },
      {
        isDuplicate: false,
        approved: true,
        fields: {
          aircraftRegistration: 'EI-KEB',
        },
      },
    ]);
    await expect(db.flightEntries.count()).resolves.toBe(1);
  });

  test('confirmation atomically writes only approved drafts with one batch and generated provenance', async () => {
    db = createPilotLogbookDb('pdf-import-confirm-test');

    const drafts = await preparePdfImportCandidates(db, [
      parsedCandidate({ flightNumber: 'KC921' }),
      parsedCandidate({ flightNumber: 'KC922', departureAirport: 'EDDF', arrivalAirport: 'UACC' }),
      parsedCandidate({ flightNumber: 'KC953', date: '2026-07-03' }),
    ]);
    drafts[1].approved = false;

    const beforeImport = new Date().toISOString();
    const imported = await importApprovedPdfCandidates(db, drafts);
    const afterImport = new Date().toISOString();
    const persisted = (await db.flightEntries.toArray()).sort((left, right) =>
      (left.flightNumber ?? '').localeCompare(right.flightNumber ?? ''),
    );

    expect(imported).toHaveLength(2);
    expect(persisted.map(({ flightNumber }) => flightNumber)).toEqual(['KC921', 'KC953']);
    expect(new Set(persisted.map(({ importBatchId }) => importBatchId)).size).toBe(1);
    expect(persisted.every(({ importBatchId }) => /^[0-9a-f-]{36}$/i.test(importBatchId ?? ''))).toBe(true);
    expect(new Set(persisted.map(({ id }) => id)).size).toBe(2);
    expect(persisted.every(({ id }) => /^[0-9a-f-]{36}$/i.test(id))).toBe(true);
    expect(persisted).toEqual(imported);
    expect(persisted.every(({ source }) => source === 'pdf_import')).toBe(true);
    expect(persisted.every(({ createdAt, updatedAt }) => createdAt === updatedAt)).toBe(true);
    expect(persisted.every(({ createdAt }) => createdAt >= beforeImport && createdAt <= afterImport)).toBe(true);
  });
});
