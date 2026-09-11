import { useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import {
  importApprovedPdfCandidates,
  type PdfImportCandidateDraft,
  type PdfImportEntryDraft,
} from '../../db/repositories/pdfImport';
import {
  manualEntryInput,
  numericEntryFields,
  validateManualEntry,
  type EntryFieldErrors,
  type ManualEntryInput,
} from '../logbook/entryForm';
import { useImportDraft } from './importDraft';

interface ReviewImportPageProps {
  db: PilotLogbookDb;
}

type TextField =
  | 'date'
  | 'departureAirport'
  | 'arrivalAirport'
  | 'flightNumber'
  | 'aircraftType'
  | 'aircraftRegistration'
  | 'timeOut'
  | 'timeIn'
  | 'simulatorType';

type NumberField = (typeof numericEntryFields)[number][0];

const textFields: Array<[TextField, string, 'date' | 'text' | 'time']> = [
  ['date', 'Date', 'date'],
  ['departureAirport', 'Departure', 'text'],
  ['arrivalAirport', 'Arrival', 'text'],
  ['flightNumber', 'Flight number', 'text'],
  ['aircraftType', 'Aircraft type', 'text'],
  ['aircraftRegistration', 'Registration', 'text'],
  ['timeOut', 'Time out', 'time'],
  ['timeIn', 'Time in', 'time'],
  ['simulatorType', 'Simulator type', 'text'],
];

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'flight' : 'flights'}`;
}

function validationInput(fields: PdfImportEntryDraft): ManualEntryInput {
  const input = manualEntryInput({
    ...fields,
    id: 'pdf-import-review',
    source: 'pdf_import',
    createdAt: '',
    updatedAt: '',
  });
  input.date = fields.date ?? '';
  for (const [field] of numericEntryFields) {
    input[field] = Number.isNaN(fields[field]) ? '' : String(fields[field]);
  }
  return input;
}

function toEntryDraft(
  result: Extract<ReturnType<typeof validateManualEntry>, { success: true }>,
): PdfImportEntryDraft {
  const {
    id: _id,
    source: _source,
    importBatchId: _importBatchId,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...fields
  } = result.entry;
  return fields;
}

function normalizeText(field: TextField, value: string): string {
  if (field === 'departureAirport' || field === 'arrivalAirport' || field === 'aircraftRegistration') {
    return value.toUpperCase();
  }
  return value;
}

function CandidateField({
  candidateIndex,
  field,
  label,
  onChange,
  error,
  type,
  value,
}: {
  candidateIndex: number;
  field: TextField | NumberField;
  label: string;
  onChange(field: TextField | NumberField, value: string): void;
  error?: string;
  type: 'date' | 'number' | 'text' | 'time';
  value: string | number | undefined;
}) {
  const id = `candidate-${candidateIndex}-${field}`;
  const errorId = `${id}-error`;
  const inputValue = typeof value === 'number' && Number.isNaN(value) ? '' : value ?? '';
  return (
    <div className="review-field">
      <label htmlFor={id}>{label}</label>
      <input
        aria-describedby={error ? errorId : undefined}
        aria-invalid={Boolean(error)}
        id={id}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(field, event.target.value)}
        step={type === 'number' ? 1 : undefined}
        type={type}
        value={inputValue}
      />
      {error ? <span className="review-field__error" id={errorId}>{error}</span> : null}
    </div>
  );
}

export function ReviewImportPage({ db }: ReviewImportPageProps) {
  const navigate = useNavigate();
  const { clearDraft, draft, setDraft } = useImportDraft();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<number, EntryFieldErrors>>({});
  const approvedCount = useMemo(
    () => draft?.candidates.filter(({ approved }) => approved).length ?? 0,
    [draft],
  );

  if (!draft) {
    return (
      <main className="pdf-review-page">
        <section className="pdf-review-empty">
          <p className="pdf-import-eyebrow">PDF import</p>
          <h1>No report to review</h1>
          <p>Choose a PDF first. Import drafts stay only in this open app session.</p>
          <Link className="primary-action pdf-review-empty__link" to="/import/logbook">Choose a PDF</Link>
        </section>
      </main>
    );
  }

  function updateCandidate(index: number, update: (candidate: PdfImportCandidateDraft) => PdfImportCandidateDraft) {
    if (!draft) return;
    setDraft({
      ...draft,
      candidates: draft.candidates.map((candidate, candidateIndex) =>
        candidateIndex === index ? update(candidate) : candidate,
      ),
    });
  }

  function updateField(index: number, field: TextField | NumberField, value: string) {
    setFieldErrors((current) => ({
      ...current,
      [index]: { ...current[index], [field as keyof ManualEntryInput]: undefined },
    }));
    updateCandidate(index, (candidate) => {
      const fields: PdfImportEntryDraft = { ...candidate.fields };
      if (numericEntryFields.some(([numberField]) => numberField === field)) {
        (fields[field as NumberField] as number) = value === '' ? Number.NaN : Number(value);
      } else {
        (fields[field as TextField] as string | undefined) = normalizeText(field as TextField, value) || undefined;
      }
      return { ...candidate, fields };
    });
  }

  async function confirmImport() {
    if (!draft || approvedCount === 0) return;
    const nextFieldErrors: Record<number, EntryFieldErrors> = {};
    const validatedCandidates = draft.candidates.map((candidate, index) => {
      if (!candidate.approved) return candidate;
      const result = validateManualEntry(validationInput(candidate.fields));
      if (!result.success) {
        nextFieldErrors[index] = result.errors;
        return candidate;
      }
      return { ...candidate, fields: toEntryDraft(result) };
    });
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    setFieldErrors({});
    setIsImporting(true);
    setError(undefined);
    try {
      await importApprovedPdfCandidates(db, validatedCandidates);
      clearDraft();
      navigate('/logbook');
    } catch {
      setError('The flights could not be imported. Your review is still here; try again.');
      setIsImporting(false);
    }
  }

  return (
    <main className="pdf-review-page">
      <header className="pdf-review-header">
        <Link className="pdf-import-back-link" to="/import/logbook">← Choose another PDF</Link>
        <p className="pdf-import-eyebrow">Review import</p>
        <h1>Review imported flights</h1>
        <p>
          Check parser warnings and edit anything that needs attention. Nothing is saved until
          you confirm the import.
        </p>
      </header>

      <section className="pdf-review-summary" aria-label="Import summary">
        <div>
          <span>Source report</span>
          <strong>{draft.fileName}</strong>
        </div>
        <p><strong>{approvedCount}</strong> of {draft.candidates.length} selected</p>
      </section>

      {draft.crossChecks.length > 0 ? (
        <section className="pdf-cross-checks" aria-labelledby="cross-check-heading">
          <h2 id="cross-check-heading">Report totals</h2>
          <ul>
            {draft.crossChecks.map((check) => (
              <li className={check.matches ? '' : 'pdf-cross-checks__warning'} key={check.label}>
                <span>{check.label}</span>
                <span>{check.parsedTotalMinutes} parsed / {check.reportedTotalMinutes} reported</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="pdf-candidate-list">
        {draft.candidates.map((candidate, index) => (
          <article
            className={`pdf-candidate${candidate.approved ? '' : ' pdf-candidate--excluded'}`}
            key={`${candidate.rawSourceLine}-${index}`}
          >
            <header className="pdf-candidate__header">
              <div>
                <p>Flight {index + 1}</p>
                <h2>{candidate.fields.departureAirport || '—'} → {candidate.fields.arrivalAirport || '—'}</h2>
              </div>
              <span className={`confidence-badge confidence-badge--${candidate.confidence}`}>
                {candidate.confidence[0].toUpperCase() + candidate.confidence.slice(1)} confidence
              </span>
            </header>

            {candidate.isDuplicate || candidate.unmatchedFields.length > 0 ? (
              <div className="pdf-candidate__warnings">
                <p>Check before importing</p>
                <ul>
                  {candidate.isDuplicate ? <li>Likely already in your logbook; excluded by default.</li> : null}
                  {candidate.unmatchedFields.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </div>
            ) : null}

            <div className="pdf-candidate__fields">
              {textFields.map(([field, label, type]) => (
                <CandidateField
                  candidateIndex={index}
                  field={field}
                  error={fieldErrors[index]?.[field as keyof ManualEntryInput]}
                  key={field}
                  label={label}
                  onChange={(nextField, value) => updateField(index, nextField, value)}
                  type={type}
                  value={candidate.fields[field]}
                />
              ))}
              {numericEntryFields.map(([field, label]) => (
                <CandidateField
                  candidateIndex={index}
                  error={fieldErrors[index]?.[field]}
                  field={field}
                  key={field}
                  label={label}
                  onChange={(nextField, value) => updateField(index, nextField, value)}
                  type="number"
                  value={candidate.fields[field]}
                />
              ))}
            </div>

            <details className="pdf-candidate__source">
              <summary>Show source row</summary>
              <p>{candidate.rawSourceLine}</p>
            </details>

            <button
              className="pdf-candidate__toggle"
              onClick={() => updateCandidate(index, (current) => ({ ...current, approved: !current.approved }))}
              type="button"
            >
              {candidate.approved ? 'Discard flight' : 'Restore flight'}
            </button>
          </article>
        ))}
      </div>

      {error ? <p className="pdf-import-error" role="alert">{error}</p> : null}

      <footer className="pdf-review-actions">
        <p>{approvedCount === 0 ? 'Select at least one flight to import.' : `${countLabel(approvedCount)} ready to import.`}</p>
        <button
          className="primary-action"
          disabled={isImporting || approvedCount === 0}
          onClick={confirmImport}
          type="button"
        >
          {isImporting ? 'Importing…' : `Import ${countLabel(approvedCount)}`}
        </button>
      </footer>
    </main>
  );
}
