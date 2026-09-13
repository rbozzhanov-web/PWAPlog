import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { loadAimsRoster, type AimsFlight } from './aims';
import { arrivalDate, layoverWindow, useArrivalWeather, weatherIcon, windDirectionLabel } from '../weather/weatherService';

type DetailTab = 'Times' | 'Crew' | 'Aircraft' | 'Notes';
const tabs: DetailTab[] = ['Times', 'Crew', 'Aircraft', 'Notes'];
function label(date: string) { return new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)); }
function initials(name: string) { return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2); }

export function FlightDetailPage() {
  const { key } = useParams(); const [tab, setTab] = useState<DetailTab>('Times');
  const roster = useMemo(() => loadAimsRoster(), []);
  const duty = useMemo(() => { const decoded = key ? decodeURIComponent(key) : ''; return roster?.duties.find((item) => item.flights.some((flight) => id(flight) === decoded)); }, [key, roster]);
  const flight = useMemo(() => { const decoded = key ? decodeURIComponent(key) : ''; return duty?.flights.find((item) => id(item) === decoded); }, [key, duty]);
  const weatherWindow = flight ? layoverWindow(roster, flight) : undefined;
  const arrivalWeather = useArrivalWeather(flight?.destination, weatherWindow?.startDate, weatherWindow?.days);
  const ordered = roster?.duties.flatMap((item) => item.flights).sort((a, b) => `${a.date}T${a.departure}`.localeCompare(`${b.date}T${b.departure}`)) ?? [];
  const index = flight ? ordered.findIndex((item) => id(item) === id(flight)) : -1;
  const hotel = flight ? roster?.hotels.find((item) => item.station.toUpperCase() === flight.destination.toUpperCase()) : undefined;
  if (!flight) return <main className="flight-detail-page"><Link to="/roster">‹ Roster</Link><section className="roster-empty-card"><h2>Flight not found</h2><p>Import the relevant AIMS roster again to view this sector.</p></section></main>;
  return <main className="flight-detail-page">
    <header className="flight-detail-header"><Link to="/roster">‹ Roster</Link><span>•••</span></header>
    <p className="flight-detail__eyebrow">FLIGHT <i>●</i></p><h1>{flight.flightNumber}</h1><p className="flight-detail__date">{label(flight.date)}</p>
    <section className="flight-detail-hero"><strong>{flight.origin} <i>→</i> {flight.destination}</strong><p>{flight.actualTimes ? 'Actual times' : 'Scheduled times'} · {flight.deadhead ? 'Deadhead' : 'Operating'}</p></section>
    <div className="flight-detail-tabs" role="tablist">{tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}</div>
    {tab === 'Times' ? <section className="flight-detail-card"><p>TIMES · LOCAL</p><div className="flight-times"><span>DEP<strong>{flight.departure}</strong></span><span>ARR<strong>{flight.arrival}</strong></span><span>DATE<strong>{flight.arrivalDate ?? flight.date}</strong></span></div>{duty?.report || duty?.release ? <div className="flight-duty-times"><span>REPORT <strong>{duty.report?.slice(11) ?? '—'}</strong></span><span>RELEASE <strong>{duty.release?.slice(11) ?? '—'}</strong></span></div> : null}</section> : null}
    {tab === 'Times' ? <WeatherCard destination={flight.destination} date={arrivalDate(flight)} state={arrivalWeather} /> : null}
    {tab === 'Crew' ? <section className="flight-detail-card"><p>CREW</p>{flight.crew?.length ? flight.crew.map((member, index) => <div className="flight-crew-row" key={`${member.name}-${index}`}><b>{initials(member.name)}</b><span><strong>{member.name}</strong><small>{member.position ?? member.role}</small></span><i>›</i></div>) : <span className="flight-detail-empty">Crew is not present in this AIMS archive.</span>}</section> : null}
    {tab === 'Aircraft' ? <section className="flight-detail-card"><p>AIRCRAFT</p>{flight.aircraftType ? <strong className="flight-aircraft">{flight.aircraftType}</strong> : <span className="flight-detail-empty">Aircraft details are not present for this sector in the imported AIMS archive.</span>}</section> : null}
    {tab === 'Notes' ? <section className="flight-detail-card"><p>LAYOVER · AIMS</p>{hotel ? <div className="flight-hotel"><strong>{hotel.station}</strong><span>{hotel.address}</span><span>{hotel.phone}</span><span>{hotel.locator ? `Locator: ${hotel.locator}` : null}</span></div> : <span className="flight-detail-empty">No hotel information for this arrival station in the imported archive.</span>}</section> : null}
    {index >= 0 ? <nav className="flight-adjacent" aria-label="Adjacent flights">{ordered[index - 1] ? <Link to={`/flight/${encodeURIComponent(id(ordered[index - 1]))}`}>‹ {ordered[index - 1].origin}–{ordered[index - 1].destination}</Link> : <span />}{ordered[index + 1] ? <Link to={`/flight/${encodeURIComponent(id(ordered[index + 1]))}`}>{ordered[index + 1].origin}–{ordered[index + 1].destination} ›</Link> : <span />}</nav> : null}
  </main>;
}

function WeatherCard({ destination, date, state }: { destination: string; date: string; state: ReturnType<typeof useArrivalWeather> }) {
  const current = state.weather; const day = state.forecast?.[0]; const conditions = current && weatherIcon(current.weatherCode, current.isDay);
  return <section className="flight-detail-card flight-weather"><p>ARRIVAL WEATHER · {destination} · {date}</p>
    {state.status === 'loading' && !current ? <span className="flight-detail-empty">Loading arrival weather…</span> : null}
    {state.status === 'offline' && !current ? <span className="flight-detail-empty">Weather is unavailable offline until this station is cached.</span> : null}
    {state.status === 'error' && !current ? <span className="flight-detail-empty">No weather data is available for this airport.</span> : null}
    {current ? <div className="flight-weather__current"><b>{conditions?.icon}</b><span><strong>{current.temp}°</strong><small>{conditions?.label}</small></span><em>{windDirectionLabel(current.windDeg)} {current.windSpeed} kt · {current.pressure} hPa</em></div> : null}
    {day ? <div className="flight-weather__forecast"><span>Forecast</span><strong>{weatherIcon(day.weatherCode).icon} {day.tempMax}° / {day.tempMin}°</strong></div> : null}
  </section>;
}
export function id(flight: AimsFlight) { return `${flight.date}|${flight.flightNumber}|${flight.origin}|${flight.destination}|${flight.departure}`; }
