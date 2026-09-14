import type { PilotLogbookDb } from '../../db/database';
import { BackupExportPanel } from './BackupExportPanel';
import { BackupImportPanel } from './BackupImportPanel';

interface SettingsPageProps {
  db: PilotLogbookDb;
}

export function SettingsPage({ db }: SettingsPageProps) {
  return (
    <main className="settings-page">
      <header className="settings-header">
        <div className="tab-header__identity">
          <p className="settings-eyebrow">Pilot Logbook</p>
          <h1>Settings</h1>
        </div>
      </header>

      <p className="settings-intro settings-intro--body">
        Your logbook data is local to this browser and device. Export a backup regularly so you
        can recover it if this device is lost, reset, or replaced.
      </p>
      <div className="settings-groups">
        <BackupImportPanel db={db} />
        <BackupExportPanel db={db} />
      </div>
    </main>
  );
}
