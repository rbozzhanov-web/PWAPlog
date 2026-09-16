import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatFlightMinutes } from '../logbook/totals';
import { loadAimsRoster, type AimsDuty } from '../roster/aims';
import { rosterMonthTotals } from '../roster/completedSectors';

export function HomePage() {
  const [now, setNow] = useState(() => Date.now());
  const [roster, setRoster] = useState(() => loadAimsRoster());

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const refreshRoster = () => setRoster(loadAimsRoster());
    window.addEventListener('aims-roster-updated', refreshRoster);
    return () => window.removeEventListener('aims-roster-updated', refreshRoster);
  }, []);

  const currentMonth = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}`;
  const month = useMemo(
    () => rosterMonthTotals(roster, currentMonth),
    [roster, currentMonth],
  );
  const nextDuty = useMemo(() => roster?.duties
    .filter((duty) => dutyEndTimestamp(duty) >= now)
    .sort((a, b) => dutyReportBoundary(a).localeCompare(dutyReportBoundary(b)))[0], [roster, now]);
  const nextFlight = useMemo(() => nextDuty?.flights.find((flight) => Date.parse(`${flight.date}T${flight.departure}:00`) >= now) ?? nextDuty?.flights[0], [nextDuty, now]);
  const reportBoundary = nextDuty ? dutyReportBoundary(nextDuty) : undefined;
  const countdown = reportBoundary ? Math.max(0, Date.parse(reportBoundary) - now) : 0;
  const today = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date()).toUpperCase();

  return (
    <main className="home-page">
      <header className="suite-header">
        <div className="suite-mark" aria-hidden="true">✈</div>
        <div><h1>eScrew</h1><p>{today}</p></div>
      </header>

      <section className="home-hero home-hero--escrew">
        <p className="home-hero__eyebrow">{nextFlight ? 'NEXT SECTOR' : 'PILOT LOGBOOK'}</p>
        {nextFlight ? <>
          <div className="home-route">
            <span><strong>{nextFlight.origin}</strong><small>{airportName(nextFlight.origin)}</small></span>
            <div className="home-route__flight">
              <svg className="home-route__plane" aria-hidden="true" viewBox="0 0 32 20"><path d="M29 10 18 2h-4l5 8H9L5 6H2l2 4-2 4h3l4-4h10l-5 8h4z" /></svg>
              <strong>{nextFlight.flightNumber}</strong>
              {nextFlight.aircraftType ? <small>{nextFlight.aircraftType}</small> : null}
            </div>
            <span><strong>{nextFlight.destination}</strong><small>{airportName(nextFlight.destination)}</small></span>
          </div>
          <div className="home-report-countdown"><span>{countdown > 0 ? 'REPORT IN' : 'REPORT TIME'}</span><strong>{countdown > 0 ? countdownClock(countdown) : reportClock(nextDuty)}</strong></div>
          <div className="home-time-grid"><div><span>Report</span><strong>{reportClock(nextDuty)}</strong><small>LOCAL</small></div><div><span>Departure</span><strong>{nextFlight.departure}</strong><small>LOCAL</small></div><div><span>Landing</span><strong>{nextFlight.arrival}</strong><small>LOCAL</small></div></div>
        </> : <><h2>{roster ? 'Ready for your next sector.' : 'Bring in your AIMS roster.'}</h2><p>Private to this device. Designed for roster context and a clean flight record.</p></>}
        {!nextFlight ? <div className="home-hero__actions"><Link to="/logbook/new">Log a flight <span>＋</span></Link></div> : null}
      </section>

      <section className="home-stats home-stats--escrew" aria-label="Logbook overview">
        <div><span>This month</span><strong>{formatFlightMinutes(month.minutes)}</strong></div>
        <div><span>Flights</span><strong>{month.flights}</strong></div>
      </section>
      <section className="home-section home-section--crew">
        <div className="home-section__title"><div><p>CREW</p><h2>Crew on this flight</h2></div></div>
        {nextFlight?.crew?.length ? <div className="home-crew-list">{nextFlight.crew.map((member, index) => (
          <div className="home-crew-row" key={`${member.name}-${index}`}><b>{crewInitials(member.name)}</b><span><strong>{member.name}</strong><small>{member.position ?? member.role ?? 'Crew'}</small></span></div>
        ))}</div> : <div className="home-empty">{nextFlight ? 'Crew is not present in this AIMS archive.' : 'Crew will appear when your next AIMS sector is available.'}</div>}
      </section>
    </main>
  );
}
function crewInitials(name: string) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2); }
function countdownClock(value: number) { const seconds = Math.max(0, Math.floor(value / 1000)); return `${Math.floor(seconds / 86_400)}d ${String(Math.floor(seconds / 3_600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function dutyReportBoundary(duty: AimsDuty) { return duty.report ?? duty.start ?? `${duty.date}T${duty.flights[0]?.departure ?? '00:00'}`; }
function dutyEndTimestamp(duty: AimsDuty) { const last = duty.flights.at(-1); const fallback = last ? `${last.arrivalDate ?? last.date}T${last.arrival}:00` : dutyReportBoundary(duty); return Date.parse(duty.end ?? fallback); }
function reportClock(duty?: AimsDuty) { return duty ? dutyReportBoundary(duty).slice(11, 16) : '—'; }
function airportName(code: string) { return ({ ALA: 'ALMATY', NQZ: 'ASTANA', FRA: 'FRANKFURT', ICN: 'SEOUL', AYT: 'ANTALYA' } as Record<string, string>)[code] ?? code; }
