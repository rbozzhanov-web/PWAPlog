import { useEffect, useState } from 'react';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import {
  createFlightEntry,
  deleteFlightEntry,
  getFlightEntry,
  updateFlightEntry,
} from '../../db/repositories/flightEntries';
import { FlightEntryForm } from './FlightEntryForm';

interface EntryEditorPageProps {
  db: PilotLogbookDb;
}

export function EntryEditorPage({ db }: EntryEditorPageProps) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [entry, setEntry] = useState<FlightLogEntry>();
  const [isLoading, setIsLoading] = useState(Boolean(id));
  const [loadError, setLoadError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    let active = true;
    setIsLoading(true);
    getFlightEntry(db, id)
      .then((storedEntry) => {
        if (!active) return;
        if (!storedEntry) {
          setLoadError('Flight not found');
        } else {
          setEntry(storedEntry);
        }
      })
      .catch(() => {
        if (active) setLoadError('The flight could not be loaded.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [db, id]);

  const saveEntry = async (nextEntry: FlightLogEntry) => {
    if (id) {
      await updateFlightEntry(db, nextEntry);
    } else {
      await createFlightEntry(db, nextEntry);
    }
    navigate('/logbook');
  };

  const removeEntry = id
    ? async () => {
        await deleteFlightEntry(db, id);
        navigate('/logbook');
      }
    : undefined;

  return (
    <main className="entry-editor-page">
      <header className="entry-editor-header">
        <Link className="entry-editor-back-link" to="/logbook">← Logbook</Link>
        <p className="entry-editor-eyebrow">Manual flight</p>
        <h1>{id ? 'Edit flight' : 'New flight'}</h1>
        <p>{id ? 'Update the details saved in your logbook.' : 'Record a flight directly on this device.'}</p>
      </header>

      {isLoading ? <p className="entry-editor-state" role="status">Loading flight…</p> : null}
      {loadError ? (
        <div className="entry-editor-state entry-editor-state--error" role="alert">
          <p>{loadError}</p>
          <Link to="/logbook">Return to logbook</Link>
        </div>
      ) : null}
      {!isLoading && !loadError ? (
        <FlightEntryForm entry={entry} onDelete={removeEntry} onSave={saveEntry} />
      ) : null}
    </main>
  );
}
