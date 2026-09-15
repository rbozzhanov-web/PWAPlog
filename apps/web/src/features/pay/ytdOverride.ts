/**
 * The taxable year-to-date figure the pay screen hands to `calculatePayPeriod`.
 *
 * Core treats any *defined* entry in `ytdOverrides` as a figure read off a real payslip: it stops
 * replaying the year from January and starts from that number instead. A zero is therefore not a
 * neutral default — it asserts "no taxable income before this month", which pins every month to
 * the bottom ИПН band and understates the tax for anyone past the annual threshold.
 *
 * So an unentered field has to reach core as no entry at all, not as 0. A pilot who genuinely
 * enters 0 still gets an override, because that is a statement about their year.
 */
export function ytdOverridesFor(
  month: string | undefined,
  taxableYtd: number | undefined,
): Record<string, number> {
  if (!month || taxableYtd === undefined) return {};
  return { [month]: taxableYtd };
}

/** Parses the field, treating an empty or unreadable value as "not entered" rather than zero. */
export function parseTaxableYtd(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
