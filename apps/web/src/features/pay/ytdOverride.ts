/**
 * The taxable year-to-date field on the Pay screen.
 *
 * Core treats any *defined* entry in `ytdOverrides` as a figure read off a real payslip: it stops
 * replaying the year from January and starts from that number instead. A zero is therefore not a
 * neutral default — it asserts "no taxable income before this month", which pins every month to
 * the bottom ИПН band and understates the tax for anyone past the annual threshold.
 *
 * So an empty field has to reach core as no entry at all, not as 0 — which is what `undefined`
 * means here, and what `withFormValues` in payInputs.ts does with it. A pilot who genuinely types
 * 0 still gets an override, because that is a statement about their year.
 */
export function parseTaxableYtd(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}
