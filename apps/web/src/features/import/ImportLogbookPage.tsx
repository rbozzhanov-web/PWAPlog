import { parseRoster } from '@pilot-logbook/core';
import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { preparePdfImportCandidates } from '../../db/repositories/pdfImport';
import { extractPdfText } from '../../platform/pdf/extractText';
import { useImportDraft } from './importDraft';

interface ImportLogbookPageProps {
  db: PilotLogbookDb;
}

const EXTRACTION_ERROR = 'The PDF could not be read. Choose another PDF or export a fresh copy.';

function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export function ImportLogbookPage({ db }: ImportLogbookPageProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);
  const { clearDraft, setDraft } = useImportDraft();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>();

  async function processFile(file: File) {
    if (processingRef.current) return;
    clearDraft();
    setError(undefined);
    if (!isPdf(file)) {
      setError('Choose a PDF file exported from your flight-time report.');
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);
    try {
      const result = parseRoster(await extractPdfText(file));
      if (result.candidates.length === 0) {
        setError('No flight entries were found. Check the report and choose another PDF.');
        return;
      }
      const candidates = await preparePdfImportCandidates(db, result.candidates);
      setDraft({
        candidates,
        crossChecks: result.crossChecks,
        fileName: file.name,
        ruleId: result.ruleId,
      });
      navigate('/import/review');
    } catch {
      setError(EXTRACTION_ERROR);
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) void processFile(file);
  }

  function dropFile(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (processingRef.current) return;
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  }

  function activatePicker(event: KeyboardEvent<HTMLLabelElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (processingRef.current) return;
    inputRef.current?.click();
  }

  return (
    <main className="pdf-import-page">
      <header className="pdf-import-header">
        <Link className="pdf-import-back-link" to="/logbook">← Logbook</Link>
        <p className="pdf-import-eyebrow">PDF import</p>
        <h1>Import logbook PDF</h1>
        <p>Select an Air Astana flight-time report. You’ll review every flight before it is saved.</p>
      </header>

      <section className="pdf-import-card" aria-labelledby="choose-report-heading">
        <div className="pdf-import-card__intro">
          <span className="pdf-import-card__icon" aria-hidden="true">⇧</span>
          <div>
            <p className="pdf-import-eyebrow">Flight-time report</p>
            <h2 id="choose-report-heading">Choose your report</h2>
          </div>
        </div>

        <label
          aria-disabled={isProcessing}
          aria-label="Drop a PDF here or choose a file"
          className={`pdf-drop-zone${isDragging ? ' pdf-drop-zone--active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            if (!processingRef.current) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropFile}
          onKeyDown={activatePicker}
          role="button"
          tabIndex={isProcessing ? -1 : 0}
        >
          <strong>{isProcessing ? 'Reading your report…' : 'Drop a PDF here'}</strong>
          <span>{isProcessing ? 'Extraction stays on this device.' : 'or choose a file from this device'}</span>
          <span className="pdf-drop-zone__action" aria-hidden="true">Choose PDF</span>
          <input
            accept="application/pdf,.pdf"
            aria-label="Choose PDF file"
            disabled={isProcessing}
            onChange={chooseFile}
            ref={inputRef}
            type="file"
          />
        </label>

        {isProcessing ? <p className="pdf-import-status" role="status">Extracting and checking flights…</p> : null}
        {error ? <p className="pdf-import-error" role="alert">{error}</p> : null}
      </section>

      <p className="pdf-import-privacy">Your report is processed locally and is not uploaded.</p>
    </main>
  );
}
