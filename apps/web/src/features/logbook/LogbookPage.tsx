import { groupEntries, targetMonthForYear, yearsWithEntries } from '@pilot-logbook/core';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries } from '../../db/repositories/flightEntries';
import { LogbookList } from './LogbookList';
import { formatFlightMinutes, sumFlightMinutes } from './totals';
import { YearChips } from './YearChips';

interface LogbookPageProps {
  db: PilotLogbookDb;
}

export function LogbookPage({ db }: LogbookPageProps) {
  const [entries, setEntries] = useState<FlightLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [activeYear, setActiveYear] = useState<number>();
  const monthElements = useRef(new Map<string, HTMLElement>());
  const groups = useMemo(() => groupEntries(entries), [entries]);
  const years = useMemo(() => yearsWithEntries(entries), [entries]);

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

  useEffect(() => {
    if (!groups.length || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (observations) => {
        const visibleMonth = observations
          .filter((observation) => observation.isIntersecting)
          .sort((left, right) =>
            left.boundingClientRect.top - right.boundingClientRect.top,
          )[0]?.target.getAttribute('data-month');

        if (visibleMonth) setActiveYear(Number(visibleMonth.slice(0, 4)));
      },
      { rootMargin: '-7rem 0px -55% 0px', threshold: [0, 0.1, 0.5] },
    );

    for (const element of monthElements.current.values()) observer.observe(element);
    return () => observer.disconnect();
  }, [groups]);

  const selectYear = (year: number) => {
    setActiveYear(year);
    const december = targetMonthForYear(year);
    const availableMonth = groups.find(({ month }) => month.startsWith(`${year}-`))?.month;
    const target = monthElements.current.get(december)
      ?? (availableMonth ? monthElements.current.get(availableMonth) : undefined);
    if (typeof target?.scrollIntoView === 'function') {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <main className="logbook-page">
      <header className="logbook-header">
        <div>
          <p className="logbook-header__eyebrow">Flight records</p>
          <h1>Pilot Logbook</h1>
          <p className="logbook-header__intro">Your flights, saved privately on this device.</p>
        </div>
        <div className="logbook-header__actions">
          <Link className="logbook-settings-link" to="/settings">Settings</Link>
          <Link className="logbook-settings-link" to="/import/logbook">Import PDF</Link>
          <Link className="logbook-new-link" to="/logbook/new">
            <span aria-hidden="true">＋</span> New flight
          </Link>
        </div>
      </header>

      {isLoading ? <p className="logbook-state" role="status">Loading flights…</p> : null}
      {loadError ? <p className="logbook-state logbook-state--error" role="alert">{loadError}</p> : null}

      {!isLoading && !loadError && entries.length === 0 ? (
        <section className="logbook-empty">
          <span className="logbook-empty__icon" aria-hidden="true">✈</span>
          <p className="logbook-empty__eyebrow">Ready for departure</p>
          <h2>No flights yet</h2>
          <p>Add your first sector to start building this device’s local logbook.</p>
          <Link className="logbook-new-link" to="/logbook/new">Log your first flight</Link>
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
            <YearChips years={years} activeYear={activeYear} onSelect={selectYear} />
          </div>
          <LogbookList groups={groups} registerMonth={registerMonth} />
        </>
      ) : null}
    </main>
  );
}
