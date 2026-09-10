import type { FlightLogEntry } from './types';

export interface MonthGroup {
  month: string;
  entries: FlightLogEntry[];
}

/** Groups ISO-dated flight entries by month, with newest months and flights first. */
export function groupEntries(entries: FlightLogEntry[]): MonthGroup[] {
  const groupsByMonth = new Map<string, FlightLogEntry[]>();

  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const group = groupsByMonth.get(month);
    if (group) {
      group.push(entry);
    } else {
      groupsByMonth.set(month, [entry]);
    }
  }

  return [...groupsByMonth]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, groupedEntries]) => ({
      month,
      entries: [...groupedEntries].sort((left, right) => right.date.localeCompare(left.date)),
    }));
}
