import type { FlightLogEntry } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries } from '../../db/repositories/flightEntries';
import { formatFlightMinutes, sumFlightMinutes } from '../logbook/totals';

interface HomePageProps { db: PilotLogbookDb }

function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${date}T00:00:00.000Z`));
}

export function HomePage({ db }: HomePageProps) {
  const [entries, setEntries] = useState<FlightLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    listFlightEntries(db).then((next) => { if (live) setEntries(next); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [db]);

  const recent = useMemo(() => entries.slice(0, 3), [entries]);
  const totalTime = useMemo(() => sumFlightMinutes(entries), [entries]);

  return (
    <main className="home-page">
      <header className="suite-header">
        <div className="suite-mark" aria-hidden="true">✈</div>
        <div><p>PRIVATE FLIGHT COMPANION</p><h1>eScrew</h1></div>
        <Link className="suite-header__more" to="/settings" aria-label="Open settings">•••</Link>
      </header>

      <section className="home-hero">
        <p className="home-hero__eyebrow">Pilot logbook</p>
        <h2>{loading ? 'Loading your flights' : entries.length ? 'Your flying, in one place.' : 'Ready for your next sector.'}</h2>
        <p>Private to this device. Designed for roster context and a clean flight record.</p>
        <div className="home-hero__actions">
          <Link to="/logbook/new">Log a flight <span>＋</span></Link>
          <Link to="/import/logbook">Import PDF</Link>
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
