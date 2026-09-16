import { EMPTY_MONTHLY_DAYS, type MonthlyDays, type PaySector } from '@pilot-logbook/core';

/**
 * Everything `calculatePayPeriod` needs about the *whole year*, not just the month on screen.
 *
 * ИПН is banded on cumulative taxable income, so core replays every earlier month of the year to
 * find which band the target month lands in. The Pay screen used to hand it one month: a rates map
 * holding only the target month, a days map holding only the target month, and only the target
 * month's sectors. Core then resolved every earlier month to a EUR/KZT rate of 0 — the pilot's
 * euro-denominated salary, flight pay and allowances are the bulk of their income, so the replay
 * saw a year of almost no earnings, kept the target month pinned to the bottom ИПН band, and
 * understated the tax. The rates were in the database the whole time, one row per month.
 *
 * So this gathers a source for every month it can. Per month the ladder is: an imported Crew
 * Schedule PDF first (it is the document pay is actually computed from), then the currently loaded
 * AIMS roster, then the logbook. A month with no source at all contributes nothing, which is the
 * honest answer and the same thing that happened before.
 */

export interface MonthSource {
  month: string;
  sectors: PaySector[];
  days?: MonthlyDays;
}

export interface PayInputs {
  sectors: PaySector[];
  monthlyDays: Record<string, MonthlyDays>;
  /** Months a source was found for, earliest first — what the replay actually had to work with. */
  months: string[];
}

/**
 * Picks one source per month from the ladder and flattens them.
 *
 * `ladder` is most-preferred first; `override` wins outright for its own month, which is how the
 * pilot's explicit "use the PDF" / "use the current AIMS roster" choice on screen is honoured for
 * the month being calculated without changing how earlier months resolve.
 */
export function buildPayInputs(ladder: MonthSource[][], override?: MonthSource): PayInputs {
  const chosen = new Map<string, MonthSource>();
  for (const tier of ladder) {
    for (const source of tier) {
      if (!chosen.has(source.month)) chosen.set(source.month, source);
    }
  }
  if (override) chosen.set(override.month, override);

  const months = [...chosen.keys()].sort();
  const monthlyDays: Record<string, MonthlyDays> = {};
  const sectors: PaySector[] = [];
  for (const month of months) {
    const source = chosen.get(month)!;
    sectors.push(...source.sectors);
    monthlyDays[month] = source.days ?? EMPTY_MONTHLY_DAYS;
  }
  return { sectors, monthlyDays, months };
}

/** Groups flat sectors (a logbook, say) into one source per month. */
export function sourcesByMonth(sectors: PaySector[]): MonthSource[] {
  const byMonth = new Map<string, PaySector[]>();
  for (const sector of sectors) {
    const month = sector.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(sector);
  }
  return [...byMonth].map(([month, monthSectors]) => ({ month, sectors: monthSectors }));
}

/**
 * The exchange rates and taxable-YTD figures the replay should use, with whatever is currently
 * typed into the form taking precedence over what is stored for that month.
 *
 * An undefined `taxableYtd` removes the month's override rather than sending 0, which core would
 * read as "no taxable income before this month" — see ytdOverride.ts.
 */
export function withFormValues<T>(
  stored: Record<string, T>,
  month: string | undefined,
  value: T | undefined,
): Record<string, T> {
  if (!month) return stored;
  const merged = { ...stored };
  if (value === undefined) delete merged[month];
  else merged[month] = value;
  return merged;
}
