import { useEffect, useMemo, useState } from 'react';
import { loadAimsRoster, parseAimsArchive, saveAimsRoster, type AimsRoster } from './aims';

export function RosterPage() {
  const [roster, setRoster] = useState<AimsRoster>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  useEffect(() => { setRoster(loadAimsRoster()); }, []);
  const flights = useMemo(() => roster?.duties.flatMap((duty) => duty.flights) ?? [], [roster]);
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
      {flights.length ? <section className="roster-flight-list">{flights.map((flight, index) => <div key={`${flight.date}-${flight.flightNumber}-${index}`}><span>{flight.date.slice(8)}</span><strong>{flight.origin} <i>→</i> {flight.destination}</strong><small>{flight.flightNumber} · {flight.departure}–{flight.arrival}{flight.deadhead ? ' · DHC' : ''}</small></div>)}</section> : null}
    </main>
  );
}
