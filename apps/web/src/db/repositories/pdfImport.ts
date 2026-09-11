import {
  NEW_ENTRY_DEFAULTS,
  annotateDuplicates,
  type AnnotatedCandidate,
  type FlightLogEntry,
  type ParsedCandidate,
} from '@pilot-logbook/core';

import type { PilotLogbookDb } from '../database';

export type PdfImportEntryDraft = Omit<
  FlightLogEntry,
  'id' | 'source' | 'importBatchId' | 'createdAt' | 'updatedAt'
>;

export interface PdfImportCandidateDraft extends Omit<AnnotatedCandidate, 'fields'> {
  fields: PdfImportEntryDraft;
  approved: boolean;
}

function toEntryDraft(fields: Partial<FlightLogEntry>): PdfImportEntryDraft {
  const {
    id: _id,
    source: _source,
    importBatchId: _importBatchId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...reviewedFields
  } = fields;

  return {
    ...NEW_ENTRY_DEFAULTS,
    ...reviewedFields,
    date: reviewedFields.date ?? '',
    departureAirport: reviewedFields.departureAirport ?? '',
    arrivalAirport: reviewedFields.arrivalAirport ?? '',
    totalTimeMinutes: reviewedFields.totalTimeMinutes ?? 0,
  };
}

export async function preparePdfImportCandidates(
  db: PilotLogbookDb,
  candidates: readonly ParsedCandidate[],
): Promise<PdfImportCandidateDraft[]> {
  const existingEntries = await db.flightEntries.toArray();

  return annotateDuplicates([...candidates], existingEntries).map((candidate) => ({
    ...candidate,
    fields: toEntryDraft(candidate.fields),
    approved: !candidate.isDuplicate,
  }));
}

export async function importApprovedPdfCandidates(
  db: PilotLogbookDb,
  candidates: readonly PdfImportCandidateDraft[],
): Promise<FlightLogEntry[]> {
  const approvedCandidates = candidates.filter(({ approved }) => approved);
  if (approvedCandidates.length === 0) return [];

  const importBatchId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const entries = approvedCandidates.map<FlightLogEntry>(({ fields }) => ({
    ...fields,
    id: crypto.randomUUID(),
    source: 'pdf_import',
    importBatchId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));

  await db.transaction('rw', db.flightEntries, async () => {
    await db.flightEntries.bulkAdd(entries);
  });

  return entries;
}
