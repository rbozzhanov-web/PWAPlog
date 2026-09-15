import { useEffect, useMemo, useState } from 'react';
import { airportCoords } from './airports';
import type { AimsFlight, AimsRoster } from '../roster/aims';

export type AirportWeather = { code: string; temp: number; weatherCode: number; isDay: boolean; windSpeed: number; windDeg: number; pressure: number; fetchedAt: number };
export type ForecastDay = { date: string; weatherCode: number; tempMax: number; tempMin: number };
export type WeatherStatus = 'loading' | 'ready' | 'offline' | 'error';
type CachedForecast = { days: ForecastDay[]; fetchedAt: number };

const STALE_AFTER_MS = 45 * 60 * 1000;
const WEATHER_CACHE = 'pwaplog.weather.v1';
const FORECAST_CACHE = 'pwaplog.forecast.v1';

function load<T>(key: string): Record<string, T> { try { return JSON.parse(localStorage.getItem(key) || '{}') as Record<string, T>; } catch { return {}; } }
function cached<T>(key: string, value: string) { return load<T>(key)[value]; }
function save<T>(key: string, value: string, item: T) { const values = load<T>(key); values[value] = item; try { localStorage.setItem(key, JSON.stringify(values)); } catch { /* Cache is optional. */ } }
function isoDay(value: string | undefined) { return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined; }
function addDays(value: string, offset: number) { const [y, m, d] = value.split('-').map(Number); const date = new Date(Date.UTC(y, m - 1, d + offset)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`; }
function online() { return typeof navigator === 'undefined' || navigator.onLine !== false; }
function stale(value: { fetchedAt: number } | undefined) { return !value || Date.now() - value.fetchedAt >= STALE_AFTER_MS; }

async function requestWeather(code: string): Promise<AirportWeather | undefined> {
  const coords = airportCoords(code); if (!coords) return undefined;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,surface_pressure&wind_speed_unit=kn`;
  const response = await fetch(url); if (!response.ok) throw new Error(`Weather request failed (${response.status})`);
  const current = (await response.json())?.current; if (!current) return undefined;
  const value: AirportWeather = { code, temp: Math.round(current.temperature_2m), weatherCode: current.weather_code, isDay: current.is_day === 1, windSpeed: Math.round(current.wind_speed_10m), windDeg: current.wind_direction_10m, pressure: Math.round(current.surface_pressure), fetchedAt: Date.now() };
  save(WEATHER_CACHE, code, value); return value;
}

async function requestForecast(code: string, startDate: string, days: number): Promise<ForecastDay[] | undefined> {
  const coords = airportCoords(code); if (!coords) return undefined;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${startDate}&end_date=${addDays(startDate, days - 1)}`;
  const response = await fetch(url); if (!response.ok) throw new Error(`Forecast request failed (${response.status})`);
  const daily = (await response.json())?.daily; if (!daily?.time) return undefined;
  const value = daily.time.map((date: string, index: number) => ({ date, weatherCode: daily.weather_code[index], tempMax: Math.round(daily.temperature_2m_max[index]), tempMin: Math.round(daily.temperature_2m_min[index]) }));
  save(FORECAST_CACHE, `${code}:${startDate}:${days}`, { days: value, fetchedAt: Date.now() } satisfies CachedForecast); return value;
}

/** Arrival day is explicit in AIMS when a sector crosses midnight; never infer it from local clock values. */
export function arrivalDate(flight: AimsFlight) { return isoDay(flight.arrivalDate) ?? flight.date; }

/** Forecast remains one day for a turnaround and covers the actual overnight stay through the next departure. */
export function layoverWindow(roster: AimsRoster | undefined, flight: AimsFlight): { startDate: string; days: number } {
  const startDate = arrivalDate(flight); const all = roster?.duties.flatMap((duty, dutyIndex) => duty.flights.map((item) => ({ item, dutyIndex }))) ?? [];
  const current = all.find((entry) => entry.item === flight);
  const next = all
    .filter((entry) => entry.item.origin === flight.destination && `${entry.item.date}T${entry.item.departure}` > `${startDate}T${flight.arrival}`)
    .sort((a, b) => `${a.item.date}T${a.item.departure}`.localeCompare(`${b.item.date}T${b.item.departure}`))[0];
  if (!next || next.dutyIndex === current?.dutyIndex) return { startDate, days: 1 };
  const delta = Math.max(0, Math.round((Date.parse(`${next.item.date}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000));
  return { startDate, days: Math.min(16, delta + 1) };
}

export function useArrivalWeather(code: string | undefined, startDate: string | undefined, days = 1) {
  const normalizedCode = code?.trim().toUpperCase(); const validDate = startDate && isoDay(startDate); const cacheKey = normalizedCode && validDate ? `${normalizedCode}:${validDate}:${days}` : undefined;
  const initialWeather = normalizedCode ? cached<AirportWeather>(WEATHER_CACHE, normalizedCode) : undefined;
  const initialForecast = cacheKey ? cached<CachedForecast>(FORECAST_CACHE, cacheKey)?.days : undefined;
  const [weather, setWeather] = useState<AirportWeather | undefined>(initialWeather);
  const [forecast, setForecast] = useState<ForecastDay[] | undefined>(initialForecast);
  const [status, setStatus] = useState<WeatherStatus>(() => initialWeather || initialForecast ? 'ready' : online() ? 'loading' : 'offline');
  const params = useMemo(() => ({ normalizedCode, validDate, cacheKey }), [normalizedCode, validDate, cacheKey]);
  useEffect(() => {
    if (!params.normalizedCode || !params.validDate || !params.cacheKey || !airportCoords(params.normalizedCode)) { setStatus('error'); return; }
    const storedWeather = cached<AirportWeather>(WEATHER_CACHE, params.normalizedCode); const storedForecast = cached<CachedForecast>(FORECAST_CACHE, params.cacheKey);
    if (storedWeather) setWeather(storedWeather); if (storedForecast?.days) setForecast(storedForecast.days);
    if (!online()) { setStatus(storedWeather || storedForecast ? 'ready' : 'offline'); return; }
    if (!stale(storedWeather) && !stale(storedForecast)) { setStatus('ready'); return; }
    setStatus(storedWeather || storedForecast ? 'ready' : 'loading'); let cancelled = false;
    Promise.all([stale(storedWeather) ? requestWeather(params.normalizedCode) : Promise.resolve(storedWeather), stale(storedForecast) ? requestForecast(params.normalizedCode, params.validDate, days) : Promise.resolve(storedForecast?.days)])
      .then(([freshWeather, freshForecast]) => { if (cancelled) return; if (freshWeather) setWeather(freshWeather); if (freshForecast) setForecast(freshForecast); setStatus(freshWeather || freshForecast || storedWeather || storedForecast ? 'ready' : 'error'); })
      .catch(() => { if (!cancelled) setStatus(storedWeather || storedForecast ? 'ready' : 'error'); });
    return () => { cancelled = true; };
  }, [params, days]);
  return { weather, forecast, status };
}

export function weatherIcon(code: number, isDay = true) { if (code === 0) return isDay ? { icon: '☀️', label: 'Clear' } : { icon: '🌙', label: 'Clear' }; if (code <= 2) return { icon: isDay ? '🌤️' : '☁️', label: 'Partly cloudy' }; if (code === 3) return { icon: '☁️', label: 'Overcast' }; if (code <= 48) return { icon: '🌫️', label: 'Fog' }; if (code <= 57) return { icon: '🌦️', label: 'Drizzle' }; if (code <= 67) return { icon: '🌧️', label: 'Rain' }; if (code <= 77) return { icon: '🌨️', label: 'Snow' }; if (code <= 82) return { icon: '🌧️', label: 'Showers' }; if (code <= 86) return { icon: '🌨️', label: 'Snow showers' }; return { icon: '⛈️', label: 'Thunderstorm' }; }
export function windDirectionLabel(deg: number) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8]; }

/* ------------------------------------------------------------------------------------------
 * Roster weather
 *
 * Every roster card carries the weather where the pilot will actually be: a flight card shows its
 * own destination on its own arrival date, and a day with no flying shows the base. One request
 * per distinct station covers the whole roster span, rather than one per card — a month of duties
 * is a handful of stations, and Open-Meteo returns a daily series in a single call.
 * ---------------------------------------------------------------------------------------- */

/** Where the pilot is when nothing on the roster says otherwise. */
export const HOME_BASE = 'ALA';

type DailyByDate = Record<string, ForecastDay>;
type StationForecast = { days: DailyByDate; fetchedAt: number };

const ROSTER_CACHE = 'pwaplog.roster-weather.v1';
/** Open-Meteo serves a daily series from about three months back to about two weeks ahead. */
const MAX_PAST_DAYS = 80;
const MAX_FUTURE_DAYS = 15;

function clampToForecastWindow(date: string, today: string): string | undefined {
  const offset = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(offset)) return undefined;
  if (offset < -MAX_PAST_DAYS) return addDays(today, -MAX_PAST_DAYS);
  if (offset > MAX_FUTURE_DAYS) return addDays(today, MAX_FUTURE_DAYS);
  return date;
}

async function requestStationSeries(code: string, from: string, to: string): Promise<DailyByDate | undefined> {
  const coords = airportCoords(code);
  if (!coords) return undefined;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`
    + `&start_date=${from}&end_date=${to}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Roster weather failed (${response.status})`);
  const daily = (await response.json())?.daily;
  if (!daily?.time) return undefined;

  const days: DailyByDate = {};
  daily.time.forEach((date: string, index: number) => {
    days[date] = {
      date,
      weatherCode: daily.weather_code[index],
      tempMax: Math.round(daily.temperature_2m_max[index]),
      tempMin: Math.round(daily.temperature_2m_min[index]),
    };
  });
  save(ROSTER_CACHE, `${code}:${from}:${to}`, { days, fetchedAt: Date.now() } satisfies StationForecast);
  return days;
}

/**
 * The station whose weather belongs on a given roster day: where the day's flying ends, or — on a
 * day with no flying — wherever the last sector left the pilot.
 *
 * The carried station is what makes a day off downroute read correctly. Falling back to the base
 * would tell a pilot sitting in Frankfurt what the weather is doing in Almaty, which is the one
 * answer they cannot use.
 */
export function stationForDay(
  flightsThatDay: Array<{ destination: string }>,
  hotelStation: string | undefined,
  carriedStation: string,
): string {
  return flightsThatDay.at(-1)?.destination ?? hotelStation ?? carriedStation;
}

/**
 * Walks the roster in order and records where each day leaves the pilot, so a run of non-flying
 * days keeps reporting the station they are actually at until a sector moves them.
 */
export function stationsByDay(
  days: Array<{ date: string; flights: Array<{ destination: string }>; hotelStation?: string }>,
): Map<string, string> {
  const byDate = new Map<string, string>();
  let carried = HOME_BASE;
  for (const day of days) {
    carried = stationForDay(day.flights, day.hotelStation, carried);
    byDate.set(day.date, carried);
  }
  return byDate;
}

export type RosterWeather = {
  /** Keyed "CODE:YYYY-MM-DD". */
  byStationDate: Map<string, ForecastDay>;
  status: WeatherStatus;
};

/**
 * Daily weather for every station the roster touches, across its own date range.
 *
 * Reads from cache first so the roster paints immediately and works offline, then refreshes in the
 * background. A station the airport table does not know is simply absent, and its cards show
 * nothing rather than a wrong place's weather.
 */
export function useRosterWeather(
  stations: string[],
  fromDate: string | undefined,
  toDate: string | undefined,
): RosterWeather {
  const key = `${[...new Set(stations)].sort().join(',')}|${fromDate}|${toDate}`;
  const [byStationDate, setByStationDate] = useState<Map<string, ForecastDay>>(new Map());
  const [status, setStatus] = useState<WeatherStatus>('loading');

  useEffect(() => {
    const codes = [...new Set(stations.map((code) => code.trim().toUpperCase()).filter(Boolean))];
    if (!codes.length || !isoDay(fromDate) || !isoDay(toDate)) { setStatus('ready'); return; }

    const today = new Date().toISOString().slice(0, 10);
    const from = clampToForecastWindow(fromDate!, today);
    const to = clampToForecastWindow(toDate!, today);
    if (!from || !to || from > to) { setStatus('ready'); return; }

    let cancelled = false;
    const merged = new Map<string, ForecastDay>();
    const absorb = (code: string, days: DailyByDate | undefined) => {
      for (const [date, day] of Object.entries(days ?? {})) merged.set(`${code}:${date}`, day);
    };

    // Paint from cache first — this is what makes the roster usable offline.
    const stale: string[] = [];
    for (const code of codes) {
      const cachedSeries = cached<StationForecast>(ROSTER_CACHE, `${code}:${from}:${to}`);
      absorb(code, cachedSeries?.days);
      if (stale2(cachedSeries)) stale.push(code);
    }
    setByStationDate(new Map(merged));
    setStatus(merged.size ? 'ready' : online() ? 'loading' : 'offline');

    if (!online() || !stale.length) { if (!merged.size) setStatus(online() ? 'ready' : 'offline'); return; }

    void Promise.all(stale.map(async (code) => {
      try { absorb(code, await requestStationSeries(code, from, to)); } catch { /* keep the cache */ }
    })).then(() => {
      if (cancelled) return;
      setByStationDate(new Map(merged));
      setStatus(merged.size ? 'ready' : 'error');
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { byStationDate, status };
}

/** A station series is refreshed once a day; a daily forecast does not move faster than that. */
function stale2(value: { fetchedAt: number } | undefined) {
  return !value || Date.now() - value.fetchedAt >= 6 * 60 * 60 * 1000;
}
