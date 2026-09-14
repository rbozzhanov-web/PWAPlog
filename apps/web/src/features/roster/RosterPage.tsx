import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAimsRoster,
  parseAimsArchive,
  saveAimsRoster,
  type AimsActivity,
  type AimsDuty,
  type AimsRoster,
} from './aims';
import { id } from './FlightDetailPage';

type RosterDay = { date: string; duties: AimsDuty[]; activities: AimsActivity[] };

export function RosterPage() {
  const [roster, setRoster] = useState<AimsRoster>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importFlowOpen, setImportFlowOpen] = useState(false);
  const [view, setView] = useState<'list' | 'stats'>('list');
  const todayElement = useRef<HTMLElement>(null);
  const today = localDateKey();
  useEffect(() => { setRoster(loadAimsRoster()); }, []);
  useEffect(() => {
    if (!importFlowOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !importing) setImportFlowOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [importFlowOpen, importing]);
  const flights = useMemo(() => roster?.duties.flatMap((duty) => duty.flights) ?? [], [roster]);
  const rosterDays = useMemo(() => roster ? buildRosterDays(roster) : [], [roster]);
  useEffect(() => {
    if (!roster || view !== 'list' || !todayElement.current) return;
    const frame = window.requestAnimationFrame(() => {
      todayElement.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [roster, view]);
  const dutyCount = roster?.duties.length ?? 0;
  const importArchive = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    setError(undefined);
    try {
      const next = await parseAimsArchive(file);
      saveAimsRoster(next);
      setRoster(next);
      setImportFlowOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import this AIMS archive.');
    } finally {
      setImporting(false);
    }
  };
  const openImportFlow = () => {
    setError(undefined);
    setImportFlowOpen(true);
  };
  const closeImportFlow = () => {
    if (!importing) setImportFlowOpen(false);
  };
  return (
    <main className="roster-page">
      <header className="suite-page-header">
        <p>CREW SCHEDULE</p>
        <div className="roster-header__title">
          <h1>Roster</h1>
          <button className="roster-header__import" disabled={importing} onClick={openImportFlow} type="button">
            <span aria-hidden="true">{roster ? '↻' : '+'}</span>
            {importing ? 'Reading…' : roster ? 'Replace AIMS' : 'Add AIMS'}
          </button>
        </div>
        <span>{roster ? `${roster.period.start} — ${roster.period.end} · saved locally` : 'Add a saved AIMS Crew Schedule Web Archive.'}</span>
      </header>
      {!roster ? <section className="roster-empty-card roster-empty-card--compact">
        <span aria-hidden="true">✈</span>
        <h2>Bring in your AIMS roster</h2>
        <p>In AIMS, open Crew Schedule, wait for it to load, save it as a Web Archive, then use Add AIMS above.</p>
      </section> : null}
      {roster ? <section className="roster-summary" aria-label="Imported roster summary"><div><span>Duties</span><strong>{dutyCount}</strong></div><div><span>Sectors</span><strong>{flights.length}</strong></div><div><span>Source</span><strong>AIMS</strong></div></section> : null}
      {roster ? <div className="roster-view-switch roster-view-switch--two" role="tablist">{(['list', 'stats'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item}</button>)}</div> : null}
      {roster && view === 'list' ? <section className="roster-duty-list">{rosterDays.map((day) => {
        const isToday = day.date === today;
        const codes = new Set(day.activities.map((activity) => activity.code.toUpperCase()));
        const state = codes.has('OFF') ? 'off' : codes.has('DOFF') ? 'doff' : undefined;
        return <article
          className={`roster-duty-card roster-day-card${state ? ` roster-day-card--${state}` : ''}${isToday ? ' roster-day-card--today' : ''}`}
          data-date={day.date}
          key={day.date}
          ref={isToday ? todayElement : undefined}
        >
          <header>
            <div>
              <p>{weekday(day.date)}{isToday ? <b className="roster-today-label">TODAY</b> : null}</p>
              <h2>{displayDate(day.date)}</h2>
            </div>
            <span>{dayTimeRange(day)}</span>
          </header>
          <div className="roster-duty-card__sectors">
            {day.activities.map((activity, index) => <div className={`roster-activity roster-activity--${activity.code.toLowerCase()}`} key={`${activity.code}-${index}`}>
              <div><strong>{activity.code}</strong><small>{activity.title || activity.type || 'Roster activity'}{activity.location ? ` · ${activity.location}` : ''}</small></div>
              <span>{activityTime(activity)}</span>
            </div>)}
            {day.duties.flatMap((duty) => duty.flights).map((flight, index) => <Link className="roster-sector" to={`/flight/${encodeURIComponent(id(flight))}`} key={`${flight.date}-${flight.flightNumber}-${index}`}><div><strong>{flight.origin} <i>→</i> {flight.destination}</strong><small>{flight.flightNumber}{flight.deadhead ? ' · DHC' : ''}{flight.actualTimes ? ' · ACT' : ''}{flight.crew?.length ? ` · Crew ${flight.crew.length}` : ''}</small></div><span>{flight.departure}<small>{flight.arrival}</small></span></Link>)}
          </div>
        </article>;
      })}</section> : null}
      {roster && view === 'stats' ? <section className="roster-empty-card roster-stats"><span>Σ</span><h2>{Math.floor((roster.totals.blockMinutes ?? 0) / 60)}h {String((roster.totals.blockMinutes ?? 0) % 60).padStart(2, '0')} block</h2><p>{dutyCount} duties · {flights.filter((flight) => !flight.deadhead).length} operating sectors · {flights.filter((flight) => flight.deadhead).length} deadhead sectors</p></section> : null}
      {importFlowOpen ? <div className="aims-import-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeImportFlow(); }}>
        <section aria-labelledby="aims-import-title" aria-modal="true" className="aims-import-sheet" role="dialog">
          <div className="aims-import-sheet__handle" aria-hidden="true" />
          <h2 id="aims-import-title">Import from AIMS</h2>
          <p>Open Crew Schedule, then Share → Options → Web Archive → Save to Files. Return to eScrew and choose that Web Archive.</p>
          <p className="aims-import-sheet__note">Web Archive only captures the period currently open in AIMS. For a completed month, use the “Personal Crew Schedule Report” PDF importer in Pay.</p>
          <a className="aims-import-sheet__primary" href="https://aims.airastana.com/eCrew/CrewSchedule" rel="noopener noreferrer" target="_blank">Open AIMS Crew Schedule</a>
          <label className={`aims-import-sheet__file${importing ? ' is-disabled' : ''}`}>
            {importing ? 'Reading schedule…' : 'Import Web Archive'}
            <input
              aria-label="Choose saved AIMS Web Archive"
              type="file"
              accept=".webarchive,text/html,application/octet-stream"
              disabled={importing}
              onChange={(event) => {
                const input = event.currentTarget;
                void importArchive(input.files?.[0]).finally(() => { input.value = ''; });
              }}
            />
          </label>
          {importing ? <p className="aims-import-sheet__status" role="status">Reading the saved schedule locally…</p> : null}
          {error ? <p className="aims-import-sheet__error" role="alert">{error}</p> : null}
          <button className="aims-import-sheet__cancel" disabled={importing} onClick={closeImportFlow} type="button">Cancel</button>
        </section>
      </div> : null}
    </main>
  );
}
function buildRosterDays(roster: AimsRoster): RosterDay[] {
  const byDate = new Map<string, RosterDay>();
  const day = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created = { date, duties: [], activities: [] };
    byDate.set(date, created);
    return created;
  };
  roster.duties.forEach((duty) => day(duty.date).duties.push(duty));
  (roster.activities ?? []).forEach((activity) => day(activity.date).activities.push(activity));
  (roster.absences ?? []).forEach((absence) => {
    const entry = day(absence.date);
    if (!entry.activities.some((activity) => activity.code.toUpperCase() === absence.code)) {
      entry.activities.push({ date: absence.date, code: absence.code, type: 'Absence' });
    }
  });
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function rosterDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function weekday(value: string) { return new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(rosterDate(value)).toUpperCase(); }
function displayDate(value: string) { return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(rosterDate(value)); }
function shortTime(value?: string) { return value?.includes('T') ? value.slice(11, 16) : undefined; }
function dayTimeRange(day: RosterDay) {
  const firstDuty = day.duties[0];
  const lastDuty = day.duties.at(-1);
  if (firstDuty && lastDuty) return `${shortTime(firstDuty.start) ?? firstDuty.flights[0]?.departure} — ${shortTime(lastDuty.end) ?? lastDuty.flights.at(-1)?.arrival}`;
  const timed = day.activities.find((activity) => shortTime(activity.start) || shortTime(activity.end));
  return timed ? `${shortTime(timed.start) ?? '—'} — ${shortTime(timed.end) ?? '—'}` : 'FULL DAY';
}
function activityTime(activity: AimsActivity) {
  const start = shortTime(activity.start);
  const end = shortTime(activity.end);
  return start || end ? `${start ?? '—'}–${end ?? '—'}` : 'ALL DAY';
}
