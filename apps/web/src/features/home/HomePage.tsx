import type { FlightLogEntry } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries } from '../../db/repositories/flightEntries';
import { formatFlightMinutes, sumFlightMinutes } from '../logbook/totals';
import { loadAimsRoster, type AimsFlight } from '../roster/aims';
import { id as flightId } from '../roster/FlightDetailPage';

interface HomePageProps { db: PilotLogbookDb }

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00.000Z`));
}

export function HomePage({ db }: HomePageProps) {
  const [entries, setEntries] = useState<FlightLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const roster = useMemo(() => loadAimsRoster(), []);

  useEffect(() => {
    let live = true;
    listFlightEntries(db).then((next) => { if (live) setEntries(next); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [db]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  const recent = useMemo(() => entries.slice(0, 3), [entries]);
  const totalTime = useMemo(() => sumFlightMinutes(entries), [entries]);
  const nextFlight = useMemo(() => roster?.duties.flatMap((duty) => duty.flights).filter((flight) => Date.parse(`${flight.date}T${flight.departure}:00`) >= now).sort((a, b) => `${a.date}T${a.departure}`.localeCompare(`${b.date}T${b.departure}`))[0], [roster, now]);
  const countdown = nextFlight ? Math.max(0, Date.parse(`${nextFlight.date}T${nextFlight.departure}:00`) - now) : 0;

  return (
    <main className="home-page">
      <header className="suite-header">
        <div className="suite-mark" aria-hidden="true">✈</div>
        <div><p>PRIVATE FLIGHT COMPANION</p><h1>eScrew</h1></div>
        <Link className="suite-header__more" to="/settings" aria-label="Open settings">•••</Link>
      </header>

      <section className="home-hero">
        <p className="home-hero__eyebrow">{nextFlight ? 'NEXT AIMS SECTOR' : 'PILOT LOGBOOK'}</p>
        <h2>{nextFlight ? `${nextFlight.origin} → ${nextFlight.destination}` : loading ? 'Loading your flights' : entries.length ? 'Your flying, in one place.' : 'Ready for your next sector.'}</h2>
        <p>{nextFlight ? `${nextFlight.flightNumber} · ${nextFlight.date} · ${nextFlight.departure} · in ${clock(countdown)}` : 'Private to this device. Designed for roster context and a clean flight record.'}</p>
        <div className="home-hero__actions">
          {nextFlight ? <Link to={`/flight/${encodeURIComponent(flightId(nextFlight))}`}>Open flight <span>›</span></Link> : <Link to="/logbook/new">Log a flight <span>＋</span></Link>}
          <Link to={roster ? "/roster" : "/import/logbook"}>{roster ? 'Open roster' : 'Import PDF'}</Link>
        </div>
      </section>

      <section className="home-stats" aria-label="Logbook overview">
        <div><span>Total time</span><strong>{formatFlightMinutes(totalTime)}</strong></div>
        <div><span>Flights</span><strong>{entries.length}</strong></div>
      </section>

      <section className="home-section">
        <div className="home-section__title"><div><p>LOGBOOK</p><h2>Recent flights</h2></div><Link to="/logbook">View all</Link></div>
        {recent.length ? <div className="home-recent-list">{recent.map((entry) => (
          <Link className="home-recent-row" key={entry.id} to={`/logbook/${entry.id}`}>
            <span className="home-recent-row__date">{dateLabel(entry.date)}</span>
            <strong>{entry.departureAirport} <i>→</i> {entry.arrivalAirport}</strong>
            <span>{formatFlightMinutes(entry.totalTimeMinutes)} ›</span>
          </Link>
        ))}</div> : <div className="home-empty">Your first logged flight will appear here.</div>}
      </section>
    </main>
  );
}
function clock(value: number) { const seconds = Math.floor(value / 1000); return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
