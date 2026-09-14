import type { PilotLogbookDb } from '../../db/database';
import { BackupExportPanel } from './BackupExportPanel';
import { BackupImportPanel } from './BackupImportPanel';

type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsPageProps {
  db: PilotLogbookDb;
  theme: ThemePreference;
  onThemeChange(theme: ThemePreference): void;
}

export function SettingsPage({ db, theme, onThemeChange }: SettingsPageProps) {
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
        <section className="settings-card settings-appearance" aria-labelledby="appearance-heading">
          <div className="settings-card__body">
            <p className="settings-eyebrow">Appearance</p>
            <h2 id="appearance-heading">Theme</h2>
            <p>Choose how eScrew looks on this device.</p>
          </div>
          <div className="settings-theme-picker" aria-label="Theme" role="radiogroup">
            {(['system', 'light', 'dark'] as const).map((option) => (
              <button
                aria-checked={theme === option}
                className={theme === option ? 'is-selected' : ''}
                key={option}
                onClick={() => onThemeChange(option)}
                role="radio"
                type="button"
              >
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </section>
        <BackupImportPanel db={db} />
        <BackupExportPanel db={db} />
      </div>
    </main>
  );
}
