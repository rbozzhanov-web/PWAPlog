import { Navigate, Link, Route, Routes } from 'react-router-dom';

import { createPilotLogbookDb } from '../db/database';
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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/logbook" element={<LogbookPlaceholder />} />
      <Route path="/settings" element={<SettingsPage db={db} />} />
      <Route path="/" element={<Navigate to="/logbook" replace />} />
      <Route path="*" element={<Navigate to="/logbook" replace />} />
    </Routes>
  );
}
