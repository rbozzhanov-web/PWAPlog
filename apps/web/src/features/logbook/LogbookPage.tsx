import { groupEntries, NEW_ENTRY_DEFAULTS, yearsWithEntries } from '@pilot-logbook/core';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries, putFlightEntries } from '../../db/repositories/flightEntries';
import { loadAimsRoster } from '../roster/aims';
import { aimsSectorId, legacySectorMinutes, sectorDayNight, sectorIdentity, sectorMinutes } from '../roster/completedSectors';
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
    const existingSectors = new Map(entries.map((entry) => [sectorIdentity(entry.date, entry.departureAirport, entry.arrivalAirport), entry]));
    const now = Date.now();
    const past = roster.duties.flatMap((duty) => duty.flights).filter((flight) => !flight.deadhead && Date.parse(`${flight.arrivalDate ?? flight.date}T${flight.arrival}:00`) < now);
    const flown = past.filter((flight) => flight.actualTimes);
    // A sector whose date has passed but which AIMS still prints on scheduled times is not written
    // to the logbook — a legal record should not carry a block time taken off a timetable. Saying
    // so matters: the pilot was told how many sectors were added and had no way to notice that
    // some of the month's flying was missing from the count.
    const awaitingActuals = past.filter((flight) => !flight.actualTimes && !existingSectors.has(sectorIdentity(flight.date, flight.origin, flight.destination)));
    // Loaded on demand: the day/night calculator reaches core's 855 KB airport dataset, which must
    // not sit in the app's entry chunk for a button most launches never press.
    const { calculateDayNight } = await import('@pilot-logbook/core/daynight/nightCalc');
    const candidates = flown.map((flight) => {
      const totalTimeMinutes = sectorMinutes(flight);
      return {
        id: aimsSectorId(flight),
        date: flight.date, flightNumber: flight.flightNumber, departureAirport: flight.origin, arrivalAirport: flight.destination,
        aircraftType: flight.aircraftType, timeOut: flight.departure, timeIn: flight.arrival, totalTimeMinutes,
        ...NEW_ENTRY_DEFAULTS, ...sectorDayNight(flight, totalTimeMinutes, calculateDayNight),
        source: 'aims_import' as const, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
    }).filter((entry) => !existingSectors.has(sectorIdentity(entry.date, entry.departureAirport, entry.arrivalAirport)));
    // Sectors this importer wrote earlier can carry a block time it computed wrongly — before the
    // station-local fix, anything crossing an offset was out by the difference — and day/night it
    // never filled in at all. Re-importing used to skip them silently because the sector was
    // already present, so the bad figures would have stayed in the record forever.
    //
    // Only what this importer itself wrote is rewritten. A manual or PDF entry is the pilot's own
    // figure; so is an AIMS entry whose block time they have since edited, which is why the total
    // is only replaced when it still matches exactly what the old calculation produced.
    const corrections = flown.flatMap((flight) => {
      const existing = existingSectors.get(sectorIdentity(flight.date, flight.origin, flight.destination));
      if (!existing || existing.source !== 'aims_import') return [];
      const minutes = sectorMinutes(flight);
      const untouchedTotal = existing.totalTimeMinutes === legacySectorMinutes(flight);
      const corrected = { ...existing, ...(untouchedTotal ? { totalTimeMinutes: minutes } : {}) };
      // Day/night is only filled in where the defaults were never replaced — by this importer or
      // by the pilot.
      if (!corrected.dayMinutes && !corrected.nightMinutes && !corrected.dayLandings && !corrected.nightLandings) {
        Object.assign(corrected, sectorDayNight(flight, corrected.totalTimeMinutes, calculateDayNight));
      }
      const changed = (Object.keys(corrected) as Array<keyof typeof corrected>).some((key) => corrected[key] !== existing[key]);
      return changed ? [{ ...corrected, updatedAt: new Date().toISOString() }] : [];
    });
    const pending = awaitingActuals.length
      ? ` ${awaitingActuals.length} flown sector${awaitingActuals.length === 1 ? '' : 's'} (${awaitingActuals.map((flight) => `${flight.flightNumber} ${flight.date}`).join(', ')}) still show scheduled times in AIMS — add ${awaitingActuals.length === 1 ? 'it' : 'them'} by hand or re-import once AIMS posts the actuals.`
      : '';
    if (!candidates.length && !corrections.length) { setAimsMessage(`No new completed AIMS sectors to add.${pending}`); return; }
    await putFlightEntries(db, [...candidates, ...corrections]);
    setEntries(await listFlightEntries(db));
    const added = candidates.length ? `${candidates.length} completed AIMS sector${candidates.length === 1 ? '' : 's'} added locally.` : '';
    const fixed = corrections.length ? `${corrections.length} existing sector${corrections.length === 1 ? '' : 's'} updated.` : '';
    setAimsMessage([added, fixed].filter(Boolean).join(' ') + pending);
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
