import { stationLocalToUtc } from '@pilot-logbook/core';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { formatLocalDateHeader, localMonthKey } from '../../platform/localDate';
import { formatFlightMinutes } from '../logbook/totals';
import { loadAimsRoster, type AimsDuty, type AimsRoster } from '../roster/aims';
import { rosterMonthTotals } from '../roster/completedSectors';
import { layoverWindow, useArrivalWeather, weatherIcon, windDirectionLabel } from '../weather/weatherService';

export function HomePage() {
  const [now, setNow] = useState(() => Date.now());
  const [roster, setRoster] = useState(() => loadAimsRoster());
  const [weatherExpanded, setWeatherExpanded] = useState(false);

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    const refreshRoster = () => setRoster(loadAimsRoster());
    window.addEventListener('aims-roster-updated', refreshRoster);
    return () => window.removeEventListener('aims-roster-updated', refreshRoster);
  }, []);

  const currentMonth = localMonthKey(new Date(now));
  const month = useMemo(
    () => rosterMonthTotals(roster, currentMonth),
    [roster, currentMonth],
  );
  const nextDuty = useMemo(() => roster?.duties
    .filter((duty) => dutyEndTimestamp(duty) >= now)
    .sort((a, b) => dutyReportBoundary(a).localeCompare(dutyReportBoundary(b)))[0], [roster, now]);
  const nextFlight = useMemo(() => nextDuty?.flights.find((flight) => Date.parse(`${flight.date}T${flight.departure}:00`) >= now) ?? nextDuty?.flights[0], [nextDuty, now]);
  const weatherWindow = useMemo(() => nextFlight ? layoverWindow(roster, nextFlight) : undefined, [roster, nextFlight]);
  const arrivalWeather = useArrivalWeather(nextFlight?.destination, weatherWindow?.startDate, weatherWindow?.days ?? 1);
  const layoverHours = useMemo(() => nextFlight ? nextLayoverHours(roster, nextFlight) : 0, [roster, nextFlight]);
  const canExpandWeather = layoverHours > 3;
  const weatherSummary = arrivalWeather.weather ? weatherIcon(arrivalWeather.weather.weatherCode, arrivalWeather.weather.isDay) : undefined;
  // The hero is one duty day, so the route is the whole chain the pilot flies that day —
  // ALA-NQZ-ALA, not just the leg in front of them — and the three times below it span the same
  // day, end to end: report, first off-blocks, release.
  const dayRoute = useMemo(() => {
    const legs = nextDuty?.flights ?? [];
    return legs.length ? { origin: legs[0].origin, legs } : undefined;
  }, [nextDuty]);
  const dayDeparture = dayRoute?.legs[0];
  const reportBoundary = nextDuty ? dutyReportBoundary(nextDuty) : undefined;
  const dutyLength = useMemo(() => dutyClock(nextDuty), [nextDuty]);
  const countdown = reportBoundary ? Math.max(0, Date.parse(reportBoundary) - now) : 0;
  const today = formatLocalDateHeader(new Date(now));

  return (
    <main className="home-page">
      <header className="suite-header">
        <div className="suite-mark" aria-hidden="true">✈</div>
        <div><h1>eScrew</h1><p>{today}</p></div>
      </header>

      <section className="home-hero home-hero--escrew">
        <div className="home-hero__lead">
          <p className="home-hero__eyebrow">{nextFlight ? 'NEXT DUTY' : 'PILOT LOGBOOK'}</p>
          {/* The day the duty starts, which is the day the pilot has to be at the airport — so it
              is the report's date, not the first sector's. They differ whenever a duty reports
              late one evening for a departure after midnight. */}
          {nextFlight && reportBoundary ? <p className="home-hero__when">{dutyDayLabel(reportBoundary.slice(0, 10))}</p> : null}
        </div>
        {nextFlight ? <>
          <div className={'home-route' + ((dayRoute?.legs.length ?? 0) > 1 ? ' home-route--chain' : '') + ((dayRoute?.legs.length ?? 0) > 2 ? ' home-route--dense' : '')}>
            <span className="home-route__stop"><strong>{dayRoute?.origin ?? nextFlight.origin}</strong>{cityName(dayRoute?.origin ?? nextFlight.origin)}</span>
            {(dayRoute?.legs ?? [nextFlight]).map((leg, index) => (
              <Fragment key={`${leg.flightNumber}-${leg.date}-${index}`}>
                <span className="home-route__flight">
                  <svg className="home-route__plane" aria-hidden="true" viewBox="0 0 32 20"><path d="M29 10 18 2h-4l5 8H9L5 6H2l2 4-2 4h3l4-4h10l-5 8h4z" /></svg>
                  <strong>{leg.flightNumber}</strong>
                  {leg.aircraftType && (dayRoute?.legs.length ?? 1) === 1 ? <small>{leg.aircraftType}</small> : null}
                </span>
                <span className="home-route__stop"><strong>{leg.destination}</strong>{cityName(leg.destination)}</span>
              </Fragment>
            ))}
          </div>
          <div className="home-report-countdown"><span>{countdown > 0 ? 'REPORT IN' : 'REPORT TIME'}</span><strong>{countdown > 0 ? countdownClock(countdown) : reportClock(nextDuty)}</strong></div>
          {/* Three clocks and a length. The clocks carry "L" because each is read at its own
              station; the duty is elapsed time and belongs to no station, so it carries none. */}
          <div className="home-time-grid">
            <div><span>Report</span><strong>{reportClock(nextDuty)}<i>L</i></strong></div>
            <div><span>Dep</span><strong>{(dayDeparture ?? nextFlight).departure}<i>L</i></strong></div>
            <div><span>Rel</span><strong>{releaseClock(nextDuty)}<i>L</i></strong></div>
            <div><span>Duty</span><strong>{dutyLength ?? '—'}</strong></div>
          </div>
        </> : <><h2>{roster ? 'Ready for your next sector.' : 'Bring in your AIMS roster.'}</h2><p>Private to this device. Designed for roster context and a clean flight record.</p></>}
        <div className="home-hero__actions">
          {nextFlight ? <div className={'home-destination-weather' + (canExpandWeather ? ' is-expandable' : '')}>
            <button aria-expanded={canExpandWeather ? weatherExpanded : undefined} disabled={!canExpandWeather} onClick={() => { if (canExpandWeather) setWeatherExpanded((value) => !value); }} type="button">
              <b aria-hidden="true">{weatherSummary?.icon ?? '◌'}</b><span><strong>{[
                nextFlight.destination,
                ...(arrivalWeather.weather
                  ? [arrivalWeather.weather.temp + '°', weatherSummary?.label, windDirectionLabel(arrivalWeather.weather.windDeg) + ' ' + arrivalWeather.weather.windSpeed + ' kt']
                  : [arrivalWeather.status === 'loading' ? 'Loading weather…' : 'Weather unavailable']),
              ].filter(Boolean).join(' • ')}</strong></span>{canExpandWeather ? <i aria-hidden="true">{weatherExpanded ? '⌃' : '⌄'}</i> : null}
            </button>
            {canExpandWeather && weatherExpanded ? <div className="home-destination-weather__forecast">{arrivalWeather.forecast?.map((day) => { const forecast = weatherIcon(day.weatherCode); return <span key={day.date}><small>{day.date}</small><strong>{forecast.icon} {day.tempMax}° / {day.tempMin}°</strong></span>; }) ?? <p>Forecast is loading…</p>}</div> : null}
          </div> : <Link to="/logbook/new">Log a flight <span>＋</span></Link>}
        </div>
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
function nextLayoverHours(roster: AimsRoster | undefined, flight: { destination: string; date: string; arrivalDate?: string; arrival: string }) {
  const arrival = Date.parse(`${flight.arrivalDate ?? flight.date}T${flight.arrival}:00`);
  const nextSector = roster?.duties.flatMap((duty) => duty.flights).filter((candidate) => candidate.origin === flight.destination && Date.parse(`${candidate.date}T${candidate.departure}:00`) > arrival).sort((a, b) => Date.parse(`${a.date}T${a.departure}:00`) - Date.parse(`${b.date}T${b.departure}:00`))[0];
  return nextSector ? Math.max(0, (Date.parse(`${nextSector.date}T${nextSector.departure}:00`) - arrival) / 3_600_000) : 0;
}
function crewInitials(name: string) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2); }
function countdownClock(value: number) { const seconds = Math.max(0, Math.floor(value / 1000)); return `${Math.floor(seconds / 86_400)}d ${String(Math.floor(seconds / 3_600) % 24).padStart(2, '0')}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; }
function dutyReportBoundary(duty: AimsDuty) { return duty.report ?? duty.start ?? `${duty.date}T${duty.flights[0]?.departure ?? '00:00'}`; }
/**
 * When the pilot is actually free — AIMS' debriefing time, which is what the roster's own release
 * column shows. The last leg's on-blocks is only a fallback for a duty AIMS gave no boundary for:
 * it is the wrong figure to plan an evening around, being half an hour or so early.
 */
function dutyReleaseBoundary(duty: AimsDuty) {
  const last = duty.flights.at(-1);
  const onBlocks = last ? `${last.arrivalDate ?? last.date}T${last.arrival}:00` : dutyReportBoundary(duty);
  return duty.release ?? duty.end ?? onBlocks;
}
function dutyEndTimestamp(duty: AimsDuty) { return Date.parse(dutyReleaseBoundary(duty)); }
function reportClock(duty?: AimsDuty) { return duty ? dutyReportBoundary(duty).slice(11, 16) : '—'; }
function releaseClock(duty?: AimsDuty) { return duty ? dutyReleaseBoundary(duty).slice(11, 16) : '—'; }
/**
 * How long the duty runs, report to release, as real elapsed time.
 *
 * Both boundaries are printed on the clock of the station they happen at, so subtracting one from
 * the other is only right for a duty that ends where it began. Reporting at 22:35 in Almaty and
 * being released at 10:25 in Seoul reads as 11:50 that way and is 7:50 — the four hours between
 * the two zones, counted as duty the pilot never worked.
 *
 * Undefined when either station is unknown, which the card shows as a dash: no figure is better
 * than a wrong one for a number a pilot might plan rest around.
 */
function dutyClock(duty?: AimsDuty) {
  if (!duty?.flights.length) return undefined;
  const report = dutyReportBoundary(duty);
  const release = dutyReleaseBoundary(duty);
  const from = stationLocalToUtc(report.slice(0, 10), report.slice(11, 16), duty.flights[0].origin);
  const to = stationLocalToUtc(release.slice(0, 10), release.slice(11, 16), duty.flights.at(-1)!.destination);
  if (!from || !to) return undefined;
  const minutes = Math.round((to.getTime() - from.getTime()) / 60_000);
  return minutes > 0 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}` : undefined;
}
/** "02 OCT · FRI", the same way the Roster timeline writes a day. */
function dutyDayLabel(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en', { ...options, timeZone: 'UTC' }).format(value).toUpperCase();
  return `${String(value.getUTCDate()).padStart(2, '0')} ${part({ month: 'short' })} · ${part({ weekday: 'short' })}`;
}
/** The city under the code, where naming it adds something — "CAN" over "CAN" said nothing. */
function cityName(code: string) {
  const name = ({ ALA: 'ALMATY', NQZ: 'ASTANA', FRA: 'FRANKFURT', ICN: 'SEOUL', AYT: 'ANTALYA', DXB: 'DUBAI', CAN: 'GUANGZHOU' } as Record<string, string>)[code];
  return name ? <small>{name}</small> : null;
}
