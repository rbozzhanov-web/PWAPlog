import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAimsRoster, parseAimsArchive, saveAimsRoster, type AimsRoster } from './aims';
import { id } from './FlightDetailPage';

export function RosterPage() {
  const [roster, setRoster] = useState<AimsRoster>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importFlowOpen, setImportFlowOpen] = useState(false);
  const [view, setView] = useState<'list' | 'calendar' | 'stats'>('list');
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
      {roster ? <div className="roster-view-switch" role="tablist">{(['list', 'calendar', 'stats'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item}</button>)}</div> : null}
      {roster && view === 'list' ? <section className="roster-duty-list">{roster.duties.map((duty, dutyIndex) => <article className="roster-duty-card" key={`${duty.date}-${dutyIndex}`}>
        <header><div><p>{new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${duty.date}T00:00:00Z`)).toUpperCase()}</p><h2>{new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${duty.date}T00:00:00Z`))}</h2></div><span>{duty.start?.slice(11) ?? duty.flights[0]?.departure} — {duty.end?.slice(11) ?? duty.flights.at(-1)?.arrival}</span></header>
        <div className="roster-duty-card__sectors">{duty.flights.map((flight, index) => <Link className="roster-sector" to={`/flight/${encodeURIComponent(id(flight))}`} key={`${flight.date}-${flight.flightNumber}-${index}`}><div><strong>{flight.origin} <i>→</i> {flight.destination}</strong><small>{flight.flightNumber}{flight.deadhead ? ' · DHC' : ''}{flight.actualTimes ? ' · ACT' : ''}{flight.crew?.length ? ` · Crew ${flight.crew.length}` : ''}</small></div><span>{flight.departure}<small>{flight.arrival}</small></span></Link>)}</div>
      </article>)}</section> : null}
      {roster && view === 'calendar' ? <section className="roster-calendar">{days(roster.period.start, roster.period.end).map((date) => { const duties = roster.duties.filter((duty) => duty.date === date); const activities = roster.activities?.filter((item) => item.date === date) ?? []; const text = duties.flatMap((duty) => duty.flights).map((flight) => `${flight.origin}–${flight.destination}`).join(' · ') || activities.map((item) => item.code).join(' · ') || '—'; return <div className={duties.length ? 'roster-calendar__day roster-calendar__day--duty' : activities.length ? 'roster-calendar__day roster-calendar__day--activity' : 'roster-calendar__day'} key={date}><small>{date.slice(8)}</small><strong>{text}</strong></div>; })}</section> : null}
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
function days(start: string, end: string) { const values: string[] = []; let value = start; while (value <= end) { values.push(value); const next = new Date(`${value}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); value = next.toISOString().slice(0, 10); } return values; }
