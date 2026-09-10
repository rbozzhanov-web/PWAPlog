import { Navigate, Link, Route, Routes } from 'react-router-dom';

import { createPilotLogbookDb } from '../db/database';
import type { PilotLogbookDb } from '../db/database';
import { EntryEditorPage } from '../features/logbook/EntryEditorPage';
import { SettingsPage } from '../features/settings/SettingsPage';

const db = createPilotLogbookDb();

function LogbookPlaceholder() {
  return (
    <main className="logbook-placeholder">
      <h1>Pilot Logbook</h1>
      <Link to="/settings">Settings</Link>
    </main>
  );
}

interface AppRoutesProps {
  db?: PilotLogbookDb;
}

export function AppRoutes({ db: routeDb = db }: AppRoutesProps) {
  return (
    <Routes>
      <Route path="/logbook" element={<LogbookPlaceholder />} />
      <Route path="/logbook/new" element={<EntryEditorPage db={routeDb} />} />
      <Route path="/logbook/:id" element={<EntryEditorPage db={routeDb} />} />
      <Route path="/settings" element={<SettingsPage db={routeDb} />} />
      <Route path="/" element={<Navigate to="/logbook" replace />} />
      <Route path="*" element={<Navigate to="/logbook" replace />} />
    </Routes>
  );
}
