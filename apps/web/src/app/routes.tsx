import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AppFrame } from './AppFrame';
import { createPilotLogbookDb } from '../db/database';
import type { PilotLogbookDb } from '../db/database';
import { ImportDraftProvider } from '../features/import/importDraft';
import { EntryEditorPage } from '../features/logbook/EntryEditorPage';
import { LogbookPage } from '../features/logbook/LogbookPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { HomePage } from '../features/home/HomePage';
import { RosterPage } from '../features/roster/RosterPage';

const db = createPilotLogbookDb();

const ImportLogbookPage = lazy(async () => ({
  default: (await import('../features/import/ImportLogbookPage')).ImportLogbookPage,
}));
const ReviewImportPage = lazy(async () => ({
  default: (await import('../features/import/ReviewImportPage')).ReviewImportPage,
}));

interface AppRoutesProps {
  db?: PilotLogbookDb;
}

export function AppRoutes({ db: routeDb = db }: AppRoutesProps) {
  return (
    <ImportDraftProvider>
      <Suspense fallback={<p role="status">Loading…</p>}>
        <Routes>
          <Route element={<AppFrame />}>
            <Route path="/" element={<HomePage db={routeDb} />} />
            <Route path="/roster" element={<RosterPage />} />
            <Route path="/logbook" element={<LogbookPage db={routeDb} />} />
            <Route path="/logbook/new" element={<EntryEditorPage db={routeDb} />} />
            <Route path="/logbook/:id" element={<EntryEditorPage db={routeDb} />} />
            <Route path="/import/logbook" element={<ImportLogbookPage db={routeDb} />} />
            <Route path="/import/review" element={<ReviewImportPage db={routeDb} />} />
            <Route path="/settings" element={<SettingsPage db={routeDb} />} />
            <Route path="*" element={<Navigate to="/logbook" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </ImportDraftProvider>
  );
}
