import type { FlightLogEntry } from '@pilot-logbook/core';

export function sumFlightMinutes(entries: FlightLogEntry[]): number {
  return entries.reduce((total, entry) => total + entry.totalTimeMinutes, 0);
}

export function formatFlightMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}m`;
}
