import { useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import {
  importApprovedPdfCandidates,
  type PdfImportCandidateDraft,
  type PdfImportEntryDraft,
} from '../../db/repositories/pdfImport';
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

type NumberField =
  | 'totalTimeMinutes'
  | 'picMinutes'
  | 'sicMinutes'
  | 'dualGivenMinutes'
  | 'dayMinutes'
  | 'nightMinutes'
  | 'simulatorMinutes';

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

const numberFields: Array<[NumberField, string]> = [
  ['totalTimeMinutes', 'Total minutes'],
  ['picMinutes', 'PIC minutes'],
  ['sicMinutes', 'SIC minutes'],
  ['dualGivenMinutes', 'Instructor minutes'],
  ['dayMinutes', 'Day minutes'],
  ['nightMinutes', 'Night minutes'],
  ['simulatorMinutes', 'Simulator minutes'],
];

function countLabel(count: number): string {
  return `${count} ${count === 1 ? 'flight' : 'flights'}`;
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
  type,
  value,
}: {
  candidateIndex: number;
  field: TextField | NumberField;
  label: string;
  onChange(field: TextField | NumberField, value: string): void;
  type: 'date' | 'number' | 'text' | 'time';
  value: string | number | undefined;
}) {
  const id = `candidate-${candidateIndex}-${field}`;
  return (
    <label className="review-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        min={type === 'number' ? 0 : undefined}
        onChange={(event) => onChange(field, event.target.value)}
        step={type === 'number' ? 1 : undefined}
        type={type}
        value={value ?? ''}
      />
    </label>
  );
}

export function ReviewImportPage({ db }: ReviewImportPageProps) {
  const navigate = useNavigate();
  const { clearDraft, draft, setDraft } = useImportDraft();
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string>();
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
    updateCandidate(index, (candidate) => {
      const fields: PdfImportEntryDraft = { ...candidate.fields };
      if (numberFields.some(([numberField]) => numberField === field)) {
        (fields[field as NumberField] as number) = value === '' ? 0 : Number(value);
      } else {
        (fields[field as TextField] as string | undefined) = normalizeText(field as TextField, value) || undefined;
      }
      return { ...candidate, fields };
    });
  }

  async function confirmImport() {
    if (!draft || approvedCount === 0) return;
    setIsImporting(true);
    setError(undefined);
    try {
      await importApprovedPdfCandidates(db, draft.candidates);
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
                  key={field}
                  label={label}
                  onChange={(nextField, value) => updateField(index, nextField, value)}
                  type={type}
                  value={candidate.fields[field]}
                />
              ))}
              {numberFields.map(([field, label]) => (
                <CandidateField
                  candidateIndex={index}
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
