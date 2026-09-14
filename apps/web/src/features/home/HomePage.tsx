import type { FlightLogEntry } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries } from '../../db/repositories/flightEntries';
import { formatFlightMinutes, sumFlightMinutes } from '../logbook/totals';
import { loadAimsRoster, type AimsDuty } from '../roster/aims';
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
  const nextDuty = useMemo(() => roster?.duties
    .filter((duty) => dutyEndTimestamp(duty) >= now)
    .sort((a, b) => dutyReportBoundary(a).localeCompare(dutyReportBoundary(b)))[0], [roster, now]);
  const nextFlight = useMemo(() => nextDuty?.flights.find((flight) => Date.parse(`${flight.date}T${flight.departure}:00`) >= now) ?? nextDuty?.flights[0], [nextDuty, now]);
  const reportBoundary = nextDuty ? dutyReportBoundary(nextDuty) : undefined;
  const countdown = reportBoundary ? Math.max(0, Date.parse(reportBoundary) - now) : 0;
  const priorDuty = useMemo(() => nextDuty && roster?.duties.filter((duty) => duty !== nextDuty && (duty.end ?? '') < (nextDuty.start ?? '')).sort((a, b) => (b.end ?? '').localeCompare(a.end ?? ''))[0], [roster, nextDuty]);
  const today = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date()).toUpperCase();

  return (
    <main className="home-page">
      <header className="suite-header">
        <div className="suite-mark" aria-hidden="true">✈</div>
        <div><h1>eScrew</h1><p>{today}</p></div>
        <Link className="suite-header__more" to="/settings" aria-label="Open settings">•••</Link>
      </header>

      <section className="home-hero">
        <p className="home-hero__eyebrow">{nextFlight ? 'NEXT SECTOR' : 'PILOT LOGBOOK'}</p>
        {nextFlight ? <>
          <div className="home-route"><span><strong>{nextFlight.origin}</strong><small>{airportName(nextFlight.origin)}</small></span><svg className="home-route__plane" aria-hidden="true" viewBox="0 0 32 20"><path d="M29 10 18 2h-4l5 8H9L5 6H2l2 4-2 4h3l4-4h10l-5 8h4z" /></svg><span><strong>{nextFlight.destination}</strong><small>{airportName(nextFlight.destination)}</small></span></div>
          <p className="home-flight-meta">{[nextFlight.flightNumber, nextFlight.aircraftType].filter(Boolean).join(' · ')}</p>
          <div className="home-report-countdown"><span>{countdown > 0 ? 'REPORT IN' : 'REPORT TIME'}</span><strong>{countdown > 0 ? clock(countdown) : reportClock(nextDuty)}</strong><small>LOCAL</small></div>
          <div className="home-time-grid"><div><span>Report</span><strong>{reportClock(nextDuty)}</strong><small>LOCAL</small></div><div><span>Departure</span><strong>{nextFlight.departure}</strong><small>LOCAL</small></div><div><span>Landing</span><strong>{nextFlight.arrival}</strong><small>LOCAL</small></div></div>
        </> : <><h2>{loading ? 'Loading your flights' : entries.length ? 'Your flying, in one place.' : 'Ready for your next sector.'}</h2><p>Private to this device. Designed for roster context and a clean flight record.</p></>}
        <div className="home-hero__actions">
          {nextFlight ? <Link to={`/flight/${encodeURIComponent(flightId(nextFlight))}`}>Open flight <span>›</span></Link> : <Link to="/logbook/new">Log a flight <span>＋</span></Link>}
          <Link to={roster ? "/roster" : "/import/logbook"}>{roster ? 'Open roster' : 'Import PDF'}</Link>
        </div>
      </section>

      <section className="home-stats" aria-label="Logbook overview">
        <div><span>Total time</span><strong>{formatFlightMinutes(totalTime)}</strong></div>
        <div><span>Flights</span><strong>{entries.length}</strong></div>
      </section>
      {nextDuty ? <section className="home-duty"><p>NEXT DUTY</p><div><strong>{reportClock(nextDuty)} LOCAL</strong><span>{nextDuty.flights.length ? `${nextDuty.flights.length} sector${nextDuty.flights.length === 1 ? '' : 's'}` : 'AIMS activity'}</span></div>{priorDuty?.end && reportBoundary ? <small>Rest before report · {formatRest(Date.parse(reportBoundary) - Date.parse(priorDuty.end))}</small> : null}</section> : null}

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
function dutyReportBoundary(duty: AimsDuty) { return duty.report ?? duty.start ?? `${duty.date}T${duty.flights[0]?.departure ?? '00:00'}`; }
function dutyEndTimestamp(duty: AimsDuty) { const last = duty.flights.at(-1); const fallback = last ? `${last.arrivalDate ?? last.date}T${last.arrival}:00` : dutyReportBoundary(duty); return Date.parse(duty.end ?? fallback); }
function reportClock(duty?: AimsDuty) { return duty ? dutyReportBoundary(duty).slice(11, 16) : '—'; }
function airportName(code: string) { return ({ ALA: 'ALMATY', NQZ: 'ASTANA', FRA: 'FRANKFURT', ICN: 'SEOUL', AYT: 'ANTALYA' } as Record<string, string>)[code] ?? code; }
function formatRest(value: number) { const hours = Math.max(0, Math.floor(value / 3_600_000)); return `${hours}h ${Math.floor((value % 3_600_000) / 60_000)}m`; }
