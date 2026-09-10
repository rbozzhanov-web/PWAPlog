/** Returns each year that has an entry, newest first. */
export function yearsWithEntries(entries: { date: string }[]): number[] {
  const years = new Set<number>();
  for (const entry of entries) years.add(Number(entry.date.slice(0, 4)));
  return [...years].sort((left, right) => right - left);
}

/** Returns the final month of a selected year, for descending logbook navigation. */
export function targetMonthForYear(year: number): string {
  return `${year}-12`;
}
