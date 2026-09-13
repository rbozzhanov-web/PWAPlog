import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadAimsRoster, parseAimsArchive, saveAimsRoster, type AimsRoster } from './aims';
import { id } from './FlightDetailPage';

export function RosterPage() {
  const [roster, setRoster] = useState<AimsRoster>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [view, setView] = useState<'list' | 'calendar' | 'stats'>('list');
  useEffect(() => { setRoster(loadAimsRoster()); }, []);
  const flights = useMemo(() => roster?.duties.flatMap((duty) => duty.flights) ?? [], [roster]);
  const dutyCount = roster?.duties.length ?? 0;
  const importArchive = async (file?: File) => { if (!file) return; setImporting(true); setError(undefined); try { const next = await parseAimsArchive(file); saveAimsRoster(next); setRoster(next); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not import this AIMS archive.'); } finally { setImporting(false); } };
  return (
    <main className="roster-page">
      <header className="suite-page-header"><p>CREW SCHEDULE</p><h1>Roster</h1><span>Import your saved AIMS Crew Schedule. It stays only on this device.</span></header>
      <section className="roster-empty-card">
        <span aria-hidden="true">✈</span>
        <h2>{roster ? `${flights.length} sectors imported` : 'Bring in your AIMS roster'}</h2>
        <p>{roster ? `${roster.period.start} — ${roster.period.end}. This local schedule is the source for roster and future pay calculations.` : 'In AIMS, open Crew Schedule, wait for it to load, then save it as a Web Archive and select it here.'}</p>
        <label className="roster-import-action">{importing ? 'Reading schedule…' : roster ? 'Replace AIMS archive' : 'Import Web Archive'}<input aria-label="Import AIMS Web Archive" type="file" accept=".webarchive,text/html,application/octet-stream" disabled={importing} onChange={(event) => void importArchive(event.target.files?.[0])} /></label>
        {error ? <p className="roster-import-error" role="alert">{error}</p> : null}
      </section>
      {roster ? <section className="roster-summary" aria-label="Imported roster summary"><div><span>Duties</span><strong>{dutyCount}</strong></div><div><span>Sectors</span><strong>{flights.length}</strong></div><div><span>Source</span><strong>AIMS</strong></div></section> : null}
      {roster ? <div className="roster-view-switch" role="tablist">{(['list', 'calendar', 'stats'] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={view === item} onClick={() => setView(item)}>{item}</button>)}</div> : null}
      {roster && view === 'list' ? <section className="roster-duty-list">{roster.duties.map((duty, dutyIndex) => <article className="roster-duty-card" key={`${duty.date}-${dutyIndex}`}>
        <header><div><p>{new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${duty.date}T00:00:00Z`)).toUpperCase()}</p><h2>{new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${duty.date}T00:00:00Z`))}</h2></div><span>{duty.start?.slice(11) ?? duty.flights[0]?.departure} — {duty.end?.slice(11) ?? duty.flights.at(-1)?.arrival}</span></header>
        <div className="roster-duty-card__sectors">{duty.flights.map((flight, index) => <Link className="roster-sector" to={`/flight/${encodeURIComponent(id(flight))}`} key={`${flight.date}-${flight.flightNumber}-${index}`}><div><strong>{flight.origin} <i>→</i> {flight.destination}</strong><small>{flight.flightNumber}{flight.deadhead ? ' · DHC' : ''}{flight.actualTimes ? ' · ACT' : ''}{flight.crew?.length ? ` · Crew ${flight.crew.length}` : ''}</small></div><span>{flight.departure}<small>{flight.arrival}</small></span></Link>)}</div>
      </article>)}</section> : null}
      {roster && view === 'calendar' ? <section className="roster-calendar">{days(roster.period.start, roster.period.end).map((date) => { const duties = roster.duties.filter((duty) => duty.date === date); return <div className={duties.length ? 'roster-calendar__day roster-calendar__day--duty' : 'roster-calendar__day'} key={date}><small>{date.slice(8)}</small><strong>{duties.flatMap((duty) => duty.flights).map((flight) => `${flight.origin}–${flight.destination}`).join(' · ') || 'OFF'}</strong></div>; })}</section> : null}
      {roster && view === 'stats' ? <section className="roster-empty-card roster-stats"><span>Σ</span><h2>{Math.floor((roster.totals.blockMinutes ?? 0) / 60)}h {String((roster.totals.blockMinutes ?? 0) % 60).padStart(2, '0')} block</h2><p>{dutyCount} duties · {flights.filter((flight) => !flight.deadhead).length} operating sectors · {flights.filter((flight) => flight.deadhead).length} deadhead sectors</p></section> : null}
    </main>
  );
}
function days(start: string, end: string) { const values: string[] = []; let value = start; while (value <= end) { values.push(value); const next = new Date(`${value}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); value = next.toISOString().slice(0, 10); } return values; }
