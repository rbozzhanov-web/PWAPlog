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

