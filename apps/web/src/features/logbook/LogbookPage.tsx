import { groupEntries, NEW_ENTRY_DEFAULTS, yearsWithEntries } from '@pilot-logbook/core';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries, putFlightEntries } from '../../db/repositories/flightEntries';
import { loadAimsRoster } from '../roster/aims';
import { aimsSectorId, sectorIdentity, sectorMinutes } from '../roster/completedSectors';
import { LogbookList } from './LogbookList';
import { formatFlightMinutes, sumFlightMinutes } from './totals';
import { YearChips } from './YearChips';

interface LogbookPageProps {
  db: PilotLogbookDb;
}

const LOGBOOK_PAGE_SIZE = 80;

export function LogbookPage({ db }: LogbookPageProps) {
  const [entries, setEntries] = useState<FlightLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [activeYear, setActiveYear] = useState<number>();
  const [visibleEntryCount, setVisibleEntryCount] = useState(LOGBOOK_PAGE_SIZE);
  const [aimsMessage, setAimsMessage] = useState<string>();
  const monthElements = useRef(new Map<string, HTMLElement>());
  const years = useMemo(() => yearsWithEntries(entries), [entries]);
  const selectedYear = activeYear ?? years[0];
  const selectedYearEntries = useMemo(
    () => selectedYear === undefined
      ? []
      : entries.filter((entry) => entry.date.startsWith(`${selectedYear}-`)),
    [entries, selectedYear],
  );
  const groups = useMemo(
    () => groupEntries(selectedYearEntries.slice(0, visibleEntryCount)),
    [selectedYearEntries, visibleEntryCount],
  );

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setLoadError(undefined);

    listFlightEntries(db)
      .then((storedEntries) => {
        if (active) setEntries(storedEntries);
      })
      .catch(() => {
        if (active) setLoadError('The logbook could not be loaded.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [db]);

  useEffect(() => {
    setActiveYear((currentYear) =>
      currentYear !== undefined && years.includes(currentYear) ? currentYear : years[0],
    );
  }, [years]);

  const registerMonth = useCallback((month: string, element: HTMLElement | null) => {
    if (element) monthElements.current.set(month, element);
    else monthElements.current.delete(month);
  }, []);

  const selectYear = (year: number) => {
    setActiveYear(year);
    setVisibleEntryCount(LOGBOOK_PAGE_SIZE);
  };
  const importCompletedAims = async () => {
    const roster = loadAimsRoster();
    if (!roster) { setAimsMessage('Import the current AIMS Web Archive first.'); return; }
    // Identity (date + airport pair), not id: an entry can already cover this real sector from a
    // manual entry or a PDF import, neither of which ever carries this module's own id scheme.
    const existingSectors = new Set(entries.map((entry) => sectorIdentity(entry.date, entry.departureAirport, entry.arrivalAirport)));
    const now = Date.now();
    const candidates = roster.duties.flatMap((duty) => duty.flights).filter((flight) => !flight.deadhead && flight.actualTimes && Date.parse(`${flight.date}T${flight.arrival}:00`) < now).map((flight) => ({
      id: aimsSectorId(flight),
      date: flight.date, flightNumber: flight.flightNumber, departureAirport: flight.origin, arrivalAirport: flight.destination,
      aircraftType: flight.aircraftType, timeOut: flight.departure, timeIn: flight.arrival, totalTimeMinutes: sectorMinutes(flight),
      ...NEW_ENTRY_DEFAULTS, source: 'aims_import' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })).filter((entry) => !existingSectors.has(sectorIdentity(entry.date, entry.departureAirport, entry.arrivalAirport)));
    if (!candidates.length) { setAimsMessage('No new completed AIMS sectors to add.'); return; }
    await putFlightEntries(db, candidates);
    setEntries(await listFlightEntries(db));
    setAimsMessage(`${candidates.length} completed AIMS sector${candidates.length === 1 ? '' : 's'} added locally.`);
  };

  return (
    <main className="logbook-page">
      <header className="logbook-header">
        <div className="tab-header__identity">
          <p className="logbook-header__eyebrow">Flight records</p>
          <h1>Pilot Logbook</h1>
        </div>
      </header>
      <section className="logbook-toolbar" aria-label="Logbook actions">
        <p className="logbook-header__intro">Your flights, saved privately on this device.</p>
        <div className="logbook-header__actions">
          <Link className="logbook-settings-link" to="/import/logbook">Import PDF</Link>
          <button className="logbook-settings-link" type="button" onClick={() => void importCompletedAims()}>Import AIMS</button>
          <Link className="logbook-new-link" to="/logbook/new">
            <span aria-hidden="true">＋</span> New flight
          </Link>
        </div>
      </section>

      {isLoading ? <p className="logbook-state" role="status">Loading flights…</p> : null}
      {loadError ? <p className="logbook-state logbook-state--error" role="alert">{loadError}</p> : null}
      {aimsMessage ? <p className="logbook-state" role="status">{aimsMessage}</p> : null}

      {!isLoading && !loadError && entries.length === 0 ? (
        <section className="logbook-empty">
          <span className="logbook-empty__icon" aria-hidden="true">✈</span>
          <p className="logbook-empty__eyebrow">Ready for departure</p>
          <h2>No flights yet</h2>
          <p>Use New flight above to start building this device’s local logbook.</p>
        </section>
      ) : null}

      {!isLoading && !loadError && entries.length > 0 ? (
        <>
          <section className="logbook-summary" aria-label="Logbook summary">
            <div>
              <span>Total flight time</span>
              <strong>{formatFlightMinutes(sumFlightMinutes(entries))}</strong>
            </div>
            <p>
              <strong>{entries.length}</strong> {entries.length === 1 ? 'flight' : 'flights'} logged
            </p>
          </section>

          <div className="year-chips-shell">
            <YearChips years={years} activeYear={selectedYear} onSelect={selectYear} />
          </div>
          <LogbookList groups={groups} registerMonth={registerMonth} />
          {visibleEntryCount < selectedYearEntries.length ? (
            <button
              className="logbook-load-more"
              onClick={() => setVisibleEntryCount((count) => count + LOGBOOK_PAGE_SIZE)}
              type="button"
            >
              Show more flights
            </button>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
