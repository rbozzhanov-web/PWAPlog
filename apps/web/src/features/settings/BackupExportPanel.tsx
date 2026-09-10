import { BACKUP_FILE_NAME } from '@pilot-logbook/core';
import { useState } from 'react';

import type { PilotLogbookDb } from '../../db/database';
import { exportLogbookBackup } from '../../db/repositories/logbookBackup';
import { shareOrDownloadJson } from '../../platform/files';

interface BackupExportPanelProps {
  db: PilotLogbookDb;
}

export function BackupExportPanel({ db }: BackupExportPanelProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function exportBackup() {
    setIsExporting(true);
    setMessage(undefined);
    setError(undefined);

    try {
      const body = await exportLogbookBackup(db);
      const file = new File([body], BACKUP_FILE_NAME, { type: 'application/json' });
      const result = await shareOrDownloadJson(file);
      setMessage(result === 'shared' ? 'Backup shared' : 'Backup downloaded');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The backup could not be exported.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="settings-card" aria-labelledby="backup-export-heading">
      <div className="settings-card__body settings-card__body--action">
        <div>
          <p className="settings-eyebrow">Recovery</p>
          <h2 id="backup-export-heading">Export logbook backup</h2>
          <p>Create a native JSON backup containing every flight currently in this logbook.</p>
        </div>
        <button type="button" className="secondary-action" onClick={exportBackup} disabled={isExporting}>
          {isExporting ? 'Preparing…' : 'Export backup'}
        </button>
      </div>
      {message ? <p className="settings-message settings-message--success" role="status">{message}</p> : null}
      {error ? <p className="settings-message settings-message--error" role="alert">{error}</p> : null}
    </section>
  );
}
