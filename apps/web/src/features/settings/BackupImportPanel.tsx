import { mergeLogbookBackup, parseLogbookBackup } from '@pilot-logbook/core';
import { useState, type ChangeEvent } from 'react';

import type { PilotLogbookDb } from '../../db/database';
import { restoreLogbookBackup } from '../../db/repositories/logbookBackup';
import { readTextFile } from '../../platform/files';

interface BackupImportPanelProps {
  db: PilotLogbookDb;
}

interface PendingImport {
  raw: string;
  added: number;
  updated: number;
  unchanged: number;
  total: number;
}

function flights(count: number): string {
  return `${count} ${count === 1 ? 'flight' : 'flights'}`;
}

export function BackupImportPanel({ db }: BackupImportPanelProps) {
  const [pending, setPending] = useState<PendingImport>();
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [isImporting, setIsImporting] = useState(false);

  async function chooseBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPending(undefined);
    setError(undefined);
    setStatus(undefined);
    if (!file) return;

    try {
      const raw = await readTextFile(file);
      const result = parseLogbookBackup(raw);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      const incoming = [
        ...new Map(result.backup.entries.map((entry) => [entry.id, entry])).values(),
      ];
      const existing = await db.flightEntries.toArray();
      const preview = mergeLogbookBackup(existing, incoming);
      setPending({
        raw,
        added: preview.added,
        updated: preview.updated,
        unchanged: preview.unchanged,
        total: incoming.length,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be read.');
    }
  }

  async function confirmImport() {
    if (!pending) return;
    setIsImporting(true);
    setError(undefined);

    try {
      await restoreLogbookBackup(db, pending.raw);
      setPending(undefined);
      setStatus('Backup imported');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be imported.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby="backup-import-heading">
      <div className="settings-card__body">
        <p className="settings-eyebrow">Restore</p>
        <h2 id="backup-import-heading">Import existing PilotLogbook backup</h2>
        <p>
          Choose a native PilotLogbook JSON backup. You can review what will change before anything
          is saved.
        </p>
      </div>

      <label className="settings-file-action">
        <span>Choose PilotLogbook backup</span>
        <input type="file" accept="application/json,.json" onChange={chooseBackup} />
      </label>

      {error ? <p className="settings-message settings-message--error" role="alert">{error}</p> : null}
      {status ? <p className="settings-message settings-message--success" role="status">{status}</p> : null}

      {pending ? (
        <div className="backup-preview" aria-live="polite">
          <p className="backup-preview__title">Ready to import</p>
          <ul>
            <li>{flights(pending.added)} will be added</li>
            <li>{flights(pending.updated)} will be updated</li>
            <li>{flights(pending.unchanged)} will stay unchanged</li>
          </ul>
          <button type="button" className="primary-action" onClick={confirmImport} disabled={isImporting}>
            {isImporting ? 'Importing…' : `Import ${flights(pending.total)}`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
