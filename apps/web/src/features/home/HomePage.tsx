import type { FlightLogEntry } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries } from '../../db/repositories/flightEntries';
import { formatFlightMinutes, sumFlightMinutes } from '../logbook/totals';
import { loadAimsRoster, type AimsDuty, type AimsRoster } from '../roster/aims';
import { layoverWindow, useArrivalWeather, weatherIcon, windDirectionLabel } from '../weather/weatherService';
import { id as flightId } from '../roster/FlightDetailPage';

interface HomePageProps { db: PilotLogbookDb }

export function HomePage({ db }: HomePageProps) {
  const [entries, setEntries] = useState<FlightLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [roster, setRoster] = useState(() => loadAimsRoster());
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  useEffect(() => {
    let live = true;
    listFlightEntries(db).then((next) => { if (live) setEntries(next); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [db]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const refreshRoster = () => setRoster(loadAimsRoster());
    window.addEventListener('aims-roster-updated', refreshRoster);
    return () => window.removeEventListener('aims-roster-updated', refreshRoster);
  }, []);

  const currentMonth = `${new Date(now).getFullYear()}-${String(new Date(now).getMonth() + 1).padStart(2, '0')}`;
  const monthlyEntries = useMemo(() => entries.filter((entry) => entry.date.startsWith(currentMonth)), [entries, currentMonth]);
  const totalTime = useMemo(() => sumFlightMinutes(monthlyEntries), [monthlyEntries]);
  const nextDuty = useMemo(() => roster?.duties
    .filter((duty) => dutyEndTimestamp(duty) >= now)
    .sort((a, b) => dutyReportBoundary(a).localeCompare(dutyReportBoundary(b)))[0], [roster, now]);
  const nextFlight = useMemo(() => nextDuty?.flights.find((flight) => Date.parse(`${flight.date}T${flight.departure}:00`) >= now) ?? nextDuty?.flights[0], [nextDuty, now]);
  const weatherWindow = useMemo(() => nextFlight ? layoverWindow(roster, nextFlight) : undefined, [roster, nextFlight]);
  const arrivalWeather = useArrivalWeather(nextFlight?.destination, weatherWindow?.startDate, weatherWindow?.days ?? 1);
  const layoverHours = useMemo(() => nextFlight ? nextLayoverHours(roster, nextFlight) : 0, [roster, nextFlight]);
  const canExpandWeather = layoverHours > 3;
  const weatherSummary = arrivalWeather.weather ? weatherIcon(arrivalWeather.weather.weatherCode, arrivalWeather.weather.isDay) : undefined;
  const reportBoundary = nextDuty ? dutyReportBoundary(nextDuty) : undefined;
  const countdown = reportBoundary ? Math.max(0, Date.parse(reportBoundary) - now) : 0;
  const today = new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date()).toUpperCase();

  return (
    <main className="home-page">
      <header className="suite-header">
        <div className="suite-mark" aria-hidden="true">✈</div>
        <div><h1>eScrew</h1><p>{today}</p></div>
      </header>

      <section className="home-hero">
        <p className="home-hero__eyebrow">{nextFlight ? 'NEXT SECTOR' : 'PILOT LOGBOOK'}</p>
        {nextFlight ? <>
          <div className="home-route"><span><strong>{nextFlight.origin}</strong><small>{airportName(nextFlight.origin)}</small></span><svg className="home-route__plane" aria-hidden="true" viewBox="0 0 32 20"><path d="M29 10 18 2h-4l5 8H9L5 6H2l2 4-2 4h3l4-4h10l-5 8h4z" /></svg><span><strong>{nextFlight.destination}</strong><small>{airportName(nextFlight.destination)}</small></span></div>
          <p className="home-flight-meta">{[nextFlight.flightNumber, nextFlight.aircraftType].filter(Boolean).join(' · ')}</p>
          <div className="home-report-countdown"><span>{countdown > 0 ? 'REPORT IN' : 'REPORT TIME'}</span><strong>{countdown > 0 ? countdownClock(countdown) : reportClock(nextDuty)}</strong></div>
          <div className="home-time-grid"><div><span>Report</span><strong>{reportClock(nextDuty)}</strong><small>LOCAL</small></div><div><span>Departure</span><strong>{nextFlight.departure}</strong><small>LOCAL</small></div><div><span>Landing</span><strong>{nextFlight.arrival}</strong><small>LOCAL</small></div></div>
        </> : <><h2>{loading ? 'Loading your flights' : entries.length ? 'Your flying, in one place.' : 'Ready for your next sector.'}</h2><p>Private to this device. Designed for roster context and a clean flight record.</p></>}
        <div className="home-hero__actions">
          {nextFlight ? <div className={'home-destination-weather' + (canExpandWeather ? ' is-expandable' : '')}>
            <button aria-expanded={canExpandWeather ? weatherExpanded : undefined} disabled={!canExpandWeather} onClick={() => { if (canExpandWeather) setWeatherExpanded((value) => !value); }} type="button">
              <b aria-hidden="true">{weatherSummary?.icon ?? '◌'}</b><span><small>DESTINATION · {nextFlight.destination}</small><strong>{arrivalWeather.weather ? [arrivalWeather.weather.temp + '°', weatherSummary?.label, windDirectionLabel(arrivalWeather.weather.windDeg) + ' ' + arrivalWeather.weather.windSpeed + ' kt'].join(' · ') : arrivalWeather.status === 'loading' ? 'Loading weather…' : 'Weather unavailable'}</strong></span>{canExpandWeather ? <i aria-hidden="true">{weatherExpanded ? '⌃' : '⌄'}</i> : null}
            </button>
            {canExpandWeather && weatherExpanded ? <div className="home-destination-weather__forecast">{arrivalWeather.forecast?.map((day) => { const forecast = weatherIcon(day.weatherCode); return <span key={day.date}><small>{day.date}</small><strong>{forecast.icon} {day.tempMax}° / {day.tempMin}°</strong></span>; }) ?? <p>Forecast is loading…</p>}</div> : null}
          </div> : <Link to="/logbook/new">Log a flight <span>＋</span></Link>}
        </div>
      </section>

      <section className="home-stats" aria-label="Logbook overview">
        <div><span>This month</span><strong>{formatFlightMinutes(totalTime)}</strong></div>
        <div><span>Flights</span><strong>{monthlyEntries.length}</strong></div>
      </section>
      <section className="home-section">
        <div className="home-section__title"><div><p>CREW</p><h2>Crew on this flight</h2></div></div>
        {nextFlight?.crew?.length ? <div className="home-crew-list">{nextFlight.crew.map((member, index) => (
          <div className="home-crew-row" key={`${member.name}-${index}`}><b>{crewInitials(member.name)}</b><span><strong>{member.name}</strong><small>{member.position ?? member.role ?? 'Crew'}</small></span></div>
        ))}</div> : <div className="home-empty">{nextFlight ? 'Crew is not present in this AIMS archive.' : 'Crew will appear when your next AIMS sector is available.'}</div>}
      </section>
    </main>
  );
}
function nextLayoverHours(roster: AimsRoster | undefined, flight: { destination: string; date: string; arrivalDate?: string; arrival: string }) {
  const arrival = Date.parse(`${flight.arrivalDate ?? flight.date}T${flight.arrival}:00`);
  const nextSector = roster?.duties.flatMap((duty) => duty.flights).filter((candidate) => candidate.origin === flight.destination && Date.parse(`${candidate.date}T${candidate.departure}:00`) > arrival).sort((a, b) => Date.parse(`${a.date}T${a.departure}:00`) - Date.parse(`${b.date}T${b.departure}:00`))[0];
  return nextSector ? Math.max(0, (Date.parse(`${nextSector.date}T${nextSector.departure}:00`) - arrival) / 3_600_000) : 0;
}
function crewInitials(name: string) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2); }
function countdownClock(value: number) { const seconds = Math.max(0, Math.floor(value / 1000)); return `${Math.floor(seconds / 86_400)}d ${String(Math.floor(seconds / 3_600) % 24).padStart(2, '0')}h ${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`; }
function dutyReportBoundary(duty: AimsDuty) { return duty.report ?? duty.start ?? `${duty.date}T${duty.flights[0]?.departure ?? '00:00'}`; }
function dutyEndTimestamp(duty: AimsDuty) { const last = duty.flights.at(-1); const fallback = last ? `${last.arrivalDate ?? last.date}T${last.arrival}:00` : dutyReportBoundary(duty); return Date.parse(duty.end ?? fallback); }
function reportClock(duty?: AimsDuty) { return duty ? dutyReportBoundary(duty).slice(11, 16) : '—'; }
function airportName(code: string) { return ({ ALA: 'ALMATY', NQZ: 'ASTANA', FRA: 'FRANKFURT', ICN: 'SEOUL', AYT: 'ANTALYA' } as Record<string, string>)[code] ?? code; }
