import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  loadAimsRoster,
  parseAimsArchive,
  saveAimsRoster,
  type AimsActivity,
  type AimsDuty,
  type AimsFlight,
  type AimsHotel,
  type AimsRoster,
} from './aims';
import { id } from './FlightDetailPage';
import { HOME_BASE, stationsByDay, useRosterWeather, weatherIcon, type ForecastDay } from '../weather/weatherService';

type RosterTimelineEntry =
  | { kind: 'activity'; activity: AimsActivity }
  | { kind: 'flight'; duty: AimsDuty; flight: AimsFlight; isFirstInDuty: boolean };
type RosterDay = { date: string; entries: RosterTimelineEntry[] };

export function RosterPage({ isActive = true }: { isActive?: boolean }) {
  const [roster, setRoster] = useState<AimsRoster>();
  const [error, setError] = useState<string>();
  const [importing, setImporting] = useState(false);
  const [importFlowOpen, setImportFlowOpen] = useState(false);
  const todayElement = useRef<HTMLDivElement>(null);
  const focusAnimation = useRef<number | undefined>(undefined);
  const today = localDateKey();
  const openImportFlow = useCallback(() => {
    setError(undefined);
    setImportFlowOpen(true);
  }, []);
  useEffect(() => { setRoster(loadAimsRoster()); }, []);
  useEffect(() => {
    window.addEventListener('open-aims-import', openImportFlow);
    return () => window.removeEventListener('open-aims-import', openImportFlow);
  }, [openImportFlow]);
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
  const rosterDays = useMemo(() => roster ? buildRosterDays(roster) : [], [roster]);
  // Every station the roster touches, fetched once across the whole span rather than per card.
  const weatherTargets = useMemo(() => {
    const stations = new Set<string>([HOME_BASE]);
    rosterDays.forEach((day) => day.entries.forEach((entry) => {
      if (entry.kind === 'flight') stations.add(entry.flight.destination);
    }));
    (roster?.hotels ?? []).forEach((hotel) => { if (hotel.station) stations.add(hotel.station); });
    return { stations: [...stations], from: rosterDays[0]?.date, to: rosterDays.at(-1)?.date };
  }, [rosterDays, roster]);
  const { byStationDate } = useRosterWeather(weatherTargets.stations, weatherTargets.from, weatherTargets.to);
  // Where each day leaves the pilot, carried forward across days with no flying.
  const stationByDate = useMemo(() => stationsByDay(rosterDays.map((day) => ({
    date: day.date,
    flights: day.entries.flatMap((entry) => entry.kind === 'flight' ? [entry.flight] : []),
    hotelStation: day.entries
      .flatMap((entry) => entry.kind === 'activity' ? [activityStation(roster?.hotels ?? [], entry.activity)] : [])
      .find(Boolean),
  }))), [rosterDays, roster]);
  useEffect(() => {
    if (!isActive || !roster || !todayElement.current) return;
    const frame = window.requestAnimationFrame(() => {
      const bubble = todayElement.current;
      const page = bubble?.closest<HTMLElement>('.primary-tab-pager__page');
      if (!bubble || !page) {
        bubble?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'smooth' });
        return;
      }
      window.cancelAnimationFrame(focusAnimation.current ?? 0);
      const headerHeight = document.querySelector('.primary-tab-header')?.getBoundingClientRect().height ?? 94;
      const target = Math.max(0, page.scrollTop + bubble.getBoundingClientRect().top - page.getBoundingClientRect().top - headerHeight - 12);
      const start = page.scrollTop;
      const distance = target - start;
      const duration = Math.min(1250, Math.max(700, Math.abs(distance) * .58));
      const startedAt = performance.now();
      const easeOut = (progress: number) => 1 - ((1 - progress) ** 3);
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        page.scrollTop = start + distance * easeOut(progress);
        if (progress < 1) focusAnimation.current = window.requestAnimationFrame(animate);
      };
      focusAnimation.current = window.requestAnimationFrame(animate);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(focusAnimation.current ?? 0);
    };
  }, [isActive, roster]);
  const importArchive = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    setError(undefined);
    try {
      const next = await parseAimsArchive(file);
      saveAimsRoster(next);
      setRoster(next);
      window.dispatchEvent(new Event('aims-roster-updated'));
      setImportFlowOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not import this AIMS archive.');
    } finally {
      setImporting(false);
    }
  };
  const closeImportFlow = () => {
    if (!importing) setImportFlowOpen(false);
  };
  return (
    <main className="roster-page">
      <header className="suite-page-header">
        <div className="tab-header__identity">
          <p>CREW SCHEDULE</p>
          <h1>Roster</h1>
        </div>
        <button className="roster-header__import" disabled={importing} onClick={openImportFlow} type="button">
          <span aria-hidden="true">{roster ? '↻' : '+'}</span>
          {importing ? 'Reading…' : roster ? 'Replace AIMS' : 'Add AIMS'}
        </button>
      </header>
      {!roster ? <section className="roster-empty-card roster-empty-card--compact">
        <span aria-hidden="true">✈</span>
        <h2>Bring in your AIMS roster</h2>
        <p>In AIMS, open Crew Schedule, wait for it to load, save it as a Web Archive, then use Add AIMS above.</p>
      </section> : null}
      {roster ? <section aria-label="Crew schedule" className="roster-timeline">
        {rosterDays.map((day) => {
          const isToday = day.date === today;
          const activities = day.entries.flatMap((entry) => entry.kind === 'activity' ? [entry.activity] : []);
          const codes = new Set(activities.map((activity) => activity.code.toUpperCase()));
          const state = codes.has('OFF') ? 'off' : codes.has('DOFF') ? 'doff' : undefined;
          const dateLabel = compactDateLabel(day.date);
          const dayStation = stationByDate.get(day.date) ?? HOME_BASE;
          const stateClass = state ? ' roster-timeline__day--' + state : '';
          const flightDayClass = day.entries.some((entry) => entry.kind === 'flight' || (entry.kind === 'activity' && isFlightActivity(entry.activity))) ? ' roster-timeline__day--flight' : '';
          const todayClass = isToday ? ' roster-timeline__day--today' : '';
          return <div
            aria-label={'Schedule for ' + displayDate(day.date) + ' · ' + dayTimeRange(day)}
            className={'roster-timeline__day' + stateClass + flightDayClass + todayClass}
            data-date={day.date}
            key={day.date}
            ref={isToday ? todayElement : undefined}
          >
            {day.entries.map((entry, index) => {
              if (entry.kind === 'activity') {
                const { activity } = entry;
                const time = activityTime(activity);
                const isFlight = isFlightActivity(activity);
                const isHotel = isHotelActivity(activity);
                if (isFlight) {
                  return <article className="roster-timeline-card roster-timeline-card--flight roster-timeline-card--fallback-flight" key={'flight-activity-' + activity.code + '-' + index}>
                    <header className="roster-timeline-card__top">
                      <p>{dateLabel}{isToday ? <b className="roster-today-label">TODAY</b> : null}</p>
                      <span>{activity.code}</span>
                    </header>
                    <strong>{activity.title || activity.location || activity.code}</strong>
                    {time !== 'ALL DAY' ? <p>{time}</p> : null}
                    <CardWeather code={dayStation} date={day.date} forecast={byStationDate} />
                  </article>;
                }
                const hotel = isHotel ? hotelForActivity(roster.hotels, activity) : undefined;
                const hotelName = hotel?.name || hotelActivityName(activity) || hotelNameFromAddress(hotel?.address);
                const hotelAddress = hotelAddressWithoutName(hotel?.address, hotelName);
                const detail = isHotel
                  ? [hotel?.station || activity.location, time !== 'ALL DAY' ? 'Rest ' + time : undefined].filter(Boolean).join(' · ')
                  : [activity.type, activity.location].filter(Boolean).join(' · ');
                return <article className={'roster-timeline-card roster-timeline-card--activity roster-timeline-card--' + activity.code.toLowerCase() + (isHotel ? ' roster-timeline-card--hotel' : '')} key={'activity-' + activity.code + '-' + index}>
                  <header className="roster-timeline-card__top">
                    <p>{dateLabel}{isToday ? <b className="roster-today-label">TODAY</b> : null}</p>
                    <span>{isHotel ? 'HOTEL' : activity.code}</span>
                  </header>
                  <h2>{isHotel ? hotelName || 'Hotel' : activity.title || activity.type || activity.code}</h2>
                  {detail ? <p>{detail}</p> : null}
                  {isHotel && (hotelAddress || hotel?.phone || hotel?.locator) ? <div className="roster-hotel-info">
                    {hotelAddress ? <span>{hotelAddress}</span> : null}
                    {hotel?.phone ? <a href={'tel:' + hotel.phone.replace(/[^+\d]/g, '')}>{hotel.phone}</a> : null}
                    {hotel?.locator ? <span>{hotel.locator}</span> : null}
                  </div> : null}
                  {!isHotel && time !== 'ALL DAY' ? <small>{time}</small> : null}
                  <CardWeather code={dayStation} date={day.date} forecast={byStationDate} />
                </article>;
              }
              const { duty, flight, isFirstInDuty } = entry;
              const report = isFirstInDuty ? shortTime(duty.report) ?? shortTime(duty.start) : undefined;
              const status = [flight.flightNumber, flight.deadhead ? 'DHC' : undefined, flight.actualTimes ? 'ACT' : undefined].filter(Boolean).join(' · ');
              const timing = [flight.departure + ' – ' + flight.arrival, report ? 'Report ' + report : undefined, flight.crew?.length ? 'Crew ' + (flight.crew?.length ?? 0) : undefined].filter(Boolean).join(' · ');
              return <Link className="roster-timeline-card roster-timeline-card--flight" to={'/flight/' + encodeURIComponent(id(flight))} key={'flight-' + flight.date + '-' + flight.flightNumber + '-' + index}>
                <div className="roster-timeline-card__top">
                  <p>{dateLabel}{isToday ? <b className="roster-today-label">TODAY</b> : null}</p>
                  <span>{status}</span>
                </div>
                <strong>{flight.origin} <i>→</i> {flight.destination}</strong>
                <p>{timing}</p>
                <CardWeather code={flight.destination} date={flight.arrivalDate ?? flight.date} forecast={byStationDate} />
              </Link>;
            })}
          </div>;
        })}

      </section> : null}
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
/**
 * The station an activity names, whether through its hotel record or its own location field. A
 * "Day Off Downroute" carries the station in `location`, which is how a rest day away from base
 * reports where the pilot actually is.
 */
function activityStation(hotels: AimsHotel[], activity: AimsActivity): string | undefined {
  // Only a hotel activity may borrow the booked hotel's station. `hotelForActivity` falls back to
  // the only hotel on the roster when it cannot match one, which is right for drawing a hotel card
  // and wrong here: it would put the layover's weather on every day off back at base.
  if (isHotelActivity(activity)) {
    const booked = hotelForActivity(hotels, activity)?.station;
    if (booked) return stationCode(booked);
  }
  return stationCode(activity.location);
}

/**
 * The weather where this card leaves the pilot. Renders nothing when the station is unknown or the
 * date falls outside what a forecast covers — a blank line reads better than a guess.
 */
function CardWeather({ code, date, forecast }: { code: string; date: string; forecast: Map<string, ForecastDay> }) {
  const day = forecast.get(`${code.trim().toUpperCase()}:${date}`);
  if (!day) return null;
  const summary = weatherIcon(day.weatherCode);
  return <p className="roster-card-weather">
    <b aria-hidden="true">{summary.icon}</b>
    <span>{code}</span>
    <em>{summary.label}</em>
    <strong>{day.tempMax}° / {day.tempMin}°</strong>
  </p>;
}

function buildRosterDays(roster: AimsRoster): RosterDay[] {
  const byDate = new Map<string, RosterDay>();
  const day = (date: string) => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created: RosterDay = { date, entries: [] };
    byDate.set(date, created);
    return created;
  };
  roster.duties.forEach((duty) => duty.flights.forEach((flight, index) => {
    day(flight.date).entries.push({ kind: 'flight', duty, flight, isFirstInDuty: index === 0 });
  }));
  (roster.activities ?? []).forEach((activity) => day(activity.date).entries.push({ kind: 'activity', activity }));
  (roster.absences ?? []).forEach((absence) => {
    const entry = day(absence.date);
    const duplicate = entry.entries.some((item) => item.kind === 'activity' && item.activity.code.toUpperCase() === absence.code);
    if (!duplicate) entry.entries.push({ kind: 'activity', activity: { date: absence.date, code: absence.code, type: 'Absence' } });
  });
  return [...byDate.values()]
    .map((entry) => ({ ...entry, entries: entry.entries.sort((a, b) => timelineStart(a).localeCompare(timelineStart(b))) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function localDateKey(value = new Date()) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function rosterDate(value: string) { return new Date(`${value}T00:00:00Z`); }
function weekday(value: string) { return new Intl.DateTimeFormat('en', { weekday: 'short', timeZone: 'UTC' }).format(rosterDate(value)).toUpperCase(); }
function displayDate(value: string) { return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(rosterDate(value)); }
function compactDateLabel(value: string) { const date = rosterDate(value); const month = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' }).format(date).toUpperCase(); return String(date.getUTCDate()).padStart(2, '0') + ' ' + month + ' · ' + weekday(value); }
function shortTime(value?: string) { return value?.includes('T') ? value.slice(11, 16) : undefined; }
function dayTimeRange(day: RosterDay) {
  const first = day.entries[0];
  const last = day.entries.at(-1);
  const start = first ? shortTime(timelineStart(first)) : undefined;
  const end = last ? shortTime(timelineEnd(last)) : undefined;
  return start || end ? (start ?? '—') + ' — ' + (end ?? '—') : 'FULL DAY';
}
function timelineStart(entry: RosterTimelineEntry) {
  return entry.kind === 'flight'
    ? entry.flight.date + 'T' + entry.flight.departure
    : entry.activity.start ?? entry.activity.date + 'T00:00';
}
function timelineEnd(entry: RosterTimelineEntry) {
  return entry.kind === 'flight'
    ? (entry.flight.arrivalDate ?? entry.flight.date) + 'T' + entry.flight.arrival
    : entry.activity.end ?? timelineStart(entry);
}

function activityTime(activity: AimsActivity) {
  const start = shortTime(activity.start);
  const end = shortTime(activity.end);
  return start || end ? `${start ?? '—'}–${end ?? '—'}` : 'ALL DAY';
}

function isFlightActivity(activity: AimsActivity) {
  return /\bFLIGHT\b/i.test(activity.type) || /^F\d{1,5}$/i.test(activity.code) || /^[A-Z]{3}(?:-[A-Z]{3})+$/i.test(activity.title ?? '');
}
function isHotelActivity(activity: AimsActivity) {
  return /\bHOTEL\b/i.test([activity.code, activity.type, activity.title].filter(Boolean).join(' '));
}
function hotelForActivity(hotels: AimsHotel[], activity: AimsActivity) {
  const station = stationCode(activity.location);
  const match = station ? hotels.find((hotel) => stationCode(hotel.station) === station) : undefined;
  return match || (hotels.length === 1 ? hotels[0] : undefined);
}
function stationCode(value?: string) {
  return /\b[A-Z]{3,4}\b/.exec(value?.toUpperCase() ?? '')?.[0];
}
function hotelActivityName(activity: AimsActivity) {
  const title = activity.title?.trim();
  return title && !/^(hotel|rest|accommodation)$/i.test(title) ? title : undefined;
}
function hotelNameFromAddress(address?: string) {
  const firstLine = address?.split(/\n+/).map((line) => line.trim()).find(Boolean);
  return firstLine && /\b(hotel|inn|resort|suites|marriott|hilton|radisson|wyndham|ibis|crowne|novotel|sheraton|hyatt|mercure|palace)\b/i.test(firstLine) ? firstLine : undefined;
}
function hotelAddressWithoutName(address?: string, name?: string) {
  if (!address || !name) return address;
  const lines = address.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines[0] === name ? lines.slice(1).join(' · ') || undefined : address;
}
