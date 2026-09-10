import { KZ_2026, KzTaxParams, PayrollResult, calculateNetPay, cappedContribution } from './kzPayroll';
import { PayHoursSummary, summarisePayHours } from './normLookup';

/**
 * The minimal shape `calculatePayPeriod` needs for one sector — enough for `FlightLogEntry` to
 * satisfy it directly, but also lean enough for a sector parsed straight from a crew schedule PDF
 * (which has none of a logbook entry's other fields) to satisfy it too.
 */
export interface PaySector {
  date: string;
  departureAirport: string;
  arrivalAirport: string;
  totalTimeMinutes: number;
}

/**
 * The pilot's own pay terms. None of these are derivable from the published norms — the norms give
 * hours, the contract gives money — so they are entered once and reused every month.
 *
 * The contract is denominated in EUR — salary, the flight-hour rate, and the night/productivity
 * allowances are all agreed in euros and converted to tenge at the rate on the last day of the
 * month the pilot is actually paid in. The transport allowance is the one exception: it is a fixed
 * tenge amount, unaffected by the rate. The pension/advance figures below are Kazakh schemes
 * settled in tenge regardless of the euro contract, so they stay in tenge (or, for the pension,
 * a rate applied to a tenge base) rather than converting.
 */
export interface PaySettings {
  /** € per block hour, applied to CrewPay Norm hours, then converted at the month's rate. */
  hourlyRateEur: number;
  /** The monthly salary line, paid regardless of hours flown. */
  monthlySalaryEur: number;
  /** Fixed allowances, entered as amounts because the rules behind them are not published. */
  nightAllowanceEur: number;
  productivityAllowanceEur: number;
  /**
   * Per-day rates for three irregular accruals — vacation pay, pilot training, and the
   * medical-exam reimbursement — multiplied by that month's day count (`MonthlyDays`, entered on
   * the screen) rather than a flat monthly amount.
   *
   * In tenge, not euros, and NOT converted by the month's rate: unlike salary/flight pay/night/
   * productivity, this is not a euro contract term. It is Kazakhstan's «средний дневной
   * заработок» (average daily earnings, Приказ Минтруда РК №908 от 30.11.2015) — a trailing
   * 12-month average of already-tenge-converted earnings — so multiplying it again by a single
   * month's EUR/KZT rate would double-convert. It also drifts month to month as that average
   * rolls forward (confirmed against three real payslips: 160 114,59 → 162 221,38 → 164 159,09
   * ₸/day across three consecutive months), so it is a setting the pilot re-enters when a payslip
   * shows it changed, not a one-time contract figure.
   */
  vacationDayRateTenge: number;
  trainingDayRateTenge: number;
  medicalExamDayRateTenge: number;
  /** Not part of the euro contract — a fixed tenge amount. */
  transportAllowance: number;
  /**
   * Взнос в КорпПП — a rate on the month's *pensionable* pay: salary, night allowance, the three
   * per-day accruals, and transport, but not flight pay or the productivity bonus (see
   * `calculateEarnings`'s `pensionableGross` — a best fit against a real payslip, not a confirmed
   * rule). One figure that appears several times on a payslip: imputed as income and taken
   * straight back out, the pilot's own contribution is withheld, and it comes off the
   * income-tax base.
   */
  corporatePensionRate: number;
  /** Regular withholding, in tenge — not a percentage of anything. */
  advance: number;
  /**
   * Ст. 95, Закон РК №261-IV: up to 50% of income under an enforcement document, computed by
   * `calculateNetPay` on what is left after ОПВ/ВОСМС/ИПН/КорпПП, not on gross pay.
   */
  alimonyRate: number;
}

export const EMPTY_PAY_SETTINGS: PaySettings = {
  hourlyRateEur: 0,
  monthlySalaryEur: 0,
  transportAllowance: 0,
  nightAllowanceEur: 0,
  productivityAllowanceEur: 0,
  vacationDayRateTenge: 0,
  trainingDayRateTenge: 0,
  medicalExamDayRateTenge: 0,
  corporatePensionRate: 0,
  advance: 0,
  alimonyRate: 0,
};

/**
 * How many days in a month count toward each of the three per-day accruals above.
 *
 * `vacationDays` and `paidVacationDays` differ on purpose. A real January 2026 payslip settled
 * this: a 10-calendar-day vacation block (15th–24th, one of them a Sunday) shrank the accrued
 * salary by all 10 days, but Air Astana's own per-day vacation-pay rule excludes Sundays (see
 * `vacationDayRateTenge`'s May example) — 9 paid days, not 10. `vacationDays` is the raw calendar
 * count, used to shrink salary/night the same way training and medical-exam days do; only
 * `paidVacationDays` feeds the vacationPay line itself.
 */
export interface MonthlyDays {
  vacationDays: number;
  paidVacationDays: number;
  trainingDays: number;
  medicalExamDays: number;
}

export const EMPTY_MONTHLY_DAYS: MonthlyDays = {
  vacationDays: 0,
  paidVacationDays: 0,
  trainingDays: 0,
  medicalExamDays: 0,
};

export interface PayEarnings {
  salary: number;
  flightPay: number;
  transportAllowance: number;
  nightAllowance: number;
  productivityAllowance: number;
  vacationPay: number;
  trainingPay: number;
  medicalExamPay: number;
  /** Company contribution imputed as income, then withheld again — no effect on take-home. */
  indirectIncome: number;
  total: number;
}

export interface PayPeriodResult {
  /** "YYYY-MM". */
  month: string;
  hours: PayHoursSummary;
  earnings: PayEarnings;
  payroll: PayrollResult;
  /** The EUR/KZT rate actually applied to this month's euro-denominated lines. */
  eurToKztRateUsed: number;
  /**
   * Months (within the same year, up to and including the target month) whose rate had to be
   * inferred rather than read from an explicit entry — see `resolveMonthlyRate`. Reported rather
   * than absorbed, the same way `PayHoursSummary.unlistedSectors` reports a sector paid on actual
   * time instead of a published norm: a borrowed rate changes the figure, so it must be visible.
   */
  fxFallbackMonths: string[];
  /**
   * The month whose `ytdOverrides` entry the replay actually started from, if any — "YYYY-MM", or
   * undefined when the replay ran all the way from January using only logbook entries.
   */
  ytdOverrideMonth?: string;
}

/**
 * A training session (or any other non-flying duty logged with matching departure/arrival) isn't
 * flying — it carries no block time and earns no flight pay. Keyed on the route rather than
 * `totalTimeMinutes` so a sector parsed from a crew schedule PDF, which has no exact block time,
 * still counts as a flight: it always has two different airports, by construction.
 */
function isFlight(entry: PaySector): boolean {
  return entry.departureAirport !== entry.arrivalAirport;
}

function daysInCalendarMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

export function entriesForMonth(entries: PaySector[], month: string): PaySector[] {
  return entries.filter((entry) => entry.date.startsWith(month) && isFlight(entry));
}

export interface ResolvedRate {
  rate: number;
  /** False when the month had no rate of its own and one was borrowed (or defaulted to 0). */
  explicit: boolean;
}

/**
 * The EUR/KZT rate to use for one month: its own entry if there is one, otherwise the nearest
 * earlier month's entry from the same year, otherwise 0.
 *
 * Scoped to the calendar year deliberately — this mirrors the ИПН scale it feeds, which also
 * resets every January, so a rate is never borrowed across a year boundary.
 */
export function resolveMonthlyRate(rates: Record<string, number>, month: string): ResolvedRate {
  if (rates[month] !== undefined) return { rate: rates[month], explicit: true };

  const year = month.slice(0, 4);
  const monthNumber = Number(month.slice(5, 7));
  for (let earlier = monthNumber - 1; earlier >= 1; earlier -= 1) {
    const key = `${year}-${String(earlier).padStart(2, '0')}`;
    if (rates[key] !== undefined) return { rate: rates[key], explicit: false };
  }

  return { rate: 0, explicit: false };
}

/**
 * Builds one month's earnings from the logbook, the pilot's terms, and that month's EUR/KZT rate.
 *
 * Flight pay is norm hours × rate, not actual hours × rate — that is the whole point of the
 * published norms, and the difference between the two is what makes checking a payslip worthwhile.
 */
export function calculateEarnings(
  entries: PaySector[],
  settings: PaySettings,
  eurToKztRate: number,
  days: MonthlyDays,
  daysInMonth: number,
  params: KzTaxParams = KZ_2026,
): { hours: PayHoursSummary; earnings: PayEarnings } {
  const hours = summarisePayHours(entries);
  const flightPay = (hours.totalMinutes / 60) * settings.hourlyRateEur * eurToKztRate;

  // Salary and night allowance are monthly euro figures for being on the roster — a vacation,
  // training or medical-exam day is compensated instead by its own per-day accrual below, so
  // those days come out of the denominator here too, or they would be paid twice. Confirmed
  // against a real June 2026 payslip: 5 training days out of 30 left the accrued salary and night
  // pay both at exactly 25/30 of the full-month figure, and a real January 2026 payslip: 10
  // calendar vacation days out of 31 (Sunday included) left both at exactly 21/31.
  const unpaidDays = days.vacationDays + days.trainingDays + days.medicalExamDays;
  const rosterFraction = Math.max(0, daysInMonth - unpaidDays) / daysInMonth;

  const salary = settings.monthlySalaryEur * eurToKztRate * rosterFraction;
  // Not converted: this allowance is a fixed tenge amount, not part of the euro contract.
  const transportAllowance = settings.transportAllowance;
  const nightAllowance = settings.nightAllowanceEur * eurToKztRate * rosterFraction;
  // Productivity does not shrink with roster days the way salary and night do — a real July 2026
  // payslip with zero such days still paid less than the stored setting × rate would suggest,
  // which only holds if the true monthly figure is 333.33 EUR rather than the round number
  // entered (worth rechecking, not something the code should also prorate on top of). It also
  // doesn't merely shrink for a *partial* month away: a real January 2026 payslip with a 10-day
  // vacation had the whole line missing, not reduced. Both are single payslips — recheck if a
  // future one, especially a month with only some vacation days, disagrees.
  const productivityAllowance = days.vacationDays > 0 ? 0 : settings.productivityAllowanceEur * eurToKztRate;
  // Also not converted — see PaySettings.vacationDayRateTenge for why these three are tenge, not
  // euros multiplied by the month's rate. Vacation pay uses `paidVacationDays`, not `vacationDays`
  // — see the MonthlyDays doc comment for why the two differ.
  const vacationPay = settings.vacationDayRateTenge * days.paidVacationDays;
  const trainingPay = settings.trainingDayRateTenge * days.trainingDays;
  const medicalExamPay = settings.medicalExamDayRateTenge * days.medicalExamDays;

  const regularGross =
    salary +
    flightPay +
    transportAllowance +
    nightAllowance +
    productivityAllowance +
    vacationPay +
    trainingPay +
    medicalExamPay;

  // The base the КорпПП rate applies to: everything except the fixed transport allowance, net of
  // ОПВ. Confirmed exactly (to the tenge) against two real payslips — June 2026 (249 750,18 ₸,
  // with training days shrinking salary/night) and July 2026 (280 131,17 ₸, a full roster month) —
  // both reproduce their real withheld amount exactly at a 4.5% rate, not the 5% the setting is
  // currently entered as; every other base tried (with or without ОПВ, with or without individual
  // earnings lines) agreed with one payslip but drifted on the other. ОПВ is estimated from
  // `regularGross` alone rather than waiting for `calculateNetPay`'s own figure — a real captain's
  // earnings sit far above the ОПВ ceiling before or after this line, so the two numbers coincide;
  // see `calculateNetPay`'s `opv` for the one actually withheld.
  const estimatedOpv = cappedContribution(regularGross, params.opvRate, params.opvCapMzp, params.mzp);
  const pensionableGross = regularGross - transportAllowance - estimatedOpv;
  const indirectIncome = pensionableGross * settings.corporatePensionRate;

  const earnings: PayEarnings = {
    salary,
    flightPay,
    transportAllowance,
    nightAllowance,
    productivityAllowance,
    vacationPay,
    trainingPay,
    medicalExamPay,
    indirectIncome,
    total: regularGross + indirectIncome,
  };

  return { hours, earnings };
}

function payMonth(
  entries: PaySector[],
  month: string,
  settings: PaySettings,
  eurToKztRate: number,
  days: MonthlyDays,
  taxableYearToDate: number,
  params: KzTaxParams,
): Omit<PayPeriodResult, 'eurToKztRateUsed' | 'fxFallbackMonths'> {
  const { hours, earnings } = calculateEarnings(
    entriesForMonth(entries, month),
    settings,
    eurToKztRate,
    days,
    daysInCalendarMonth(month),
    params,
  );

  const payroll = calculateNetPay(
    {
      grossEarnings: earnings.total,
      voluntaryPension: earnings.indirectIncome,
      taxableYearToDate,
      alimonyRate: settings.alimonyRate,
      // The imputed company contribution is taken straight back out, alongside the ordinary
      // withholdings. Net effect of the pair is zero, which is why it can be added and removed.
      otherDeductions: settings.advance + earnings.indirectIncome,
    },
    params,
  );

  return { month, hours, earnings, payroll };
}

/**
 * Calculates a month, replaying the year up to it so the income-tax scale lands on the right band.
 *
 * ИПН is annual and cumulative, so a month cannot be computed on its own — the same flying is
 * taxed at 10% in January and 15% by midsummer. Rather than storing a running total that could
 * drift out of step with the logbook, every earlier month of the same year is recomputed from the
 * entries and the accumulated taxable base carried forward.
 *
 * Earnings are now euro-denominated too, so the replay needs each earlier month's *own* rate, not
 * the target month's — a March flown at March's rate, however different from today's, is what
 * actually built March's taxable income and therefore this year's running total. `rates` maps
 * "YYYY-MM" to an EUR/KZT rate for whichever months the pilot has entered one; a month missing
 * from it resolves via `resolveMonthlyRate` and is named in the returned `fxFallbackMonths`.
 *
 * The other assumption this makes is worth stating: today's settings (salary, allowances) are
 * applied to every month of the year. Where those changed mid-year, earlier months are
 * approximated, and the current month's band can be off if that error pushes the year-to-date
 * across the threshold.
 *
 * Replaying from January also assumes the logbook actually has every earlier month logged. A
 * pilot who starts using the app mid-year — or whose earlier months are still incomplete — would
 * otherwise have every month computed as if it were January, understating ИПН for the rest of the
 * year. `ytdOverrides["YYYY-MM"]` is the known cumulative taxable income going *into* that month,
 * taken straight off a real payslip; when set, the replay starts there instead of at January, and
 * only recomputes the months after it from the logbook.
 */
export function calculatePayPeriod(
  entries: PaySector[],
  month: string,
  settings: PaySettings,
  rates: Record<string, number>,
  monthlyDays: Record<string, MonthlyDays> = {},
  params: KzTaxParams = KZ_2026,
  ytdOverrides: Record<string, number> = {},
): PayPeriodResult {
  const year = month.slice(0, 4);
  const monthNumber = Number(month.slice(5, 7));
  const fxFallbackMonths: string[] = [];

  let taxableYearToDate = 0;
  let replayFromMonth = 1;
  let ytdOverrideMonth: string | undefined;
  for (let earlier = monthNumber; earlier >= 1; earlier -= 1) {
    const key = `${year}-${String(earlier).padStart(2, '0')}`;
    if (ytdOverrides[key] !== undefined) {
      taxableYearToDate = ytdOverrides[key];
      replayFromMonth = earlier;
      ytdOverrideMonth = key;
      break;
    }
  }

  for (let earlier = replayFromMonth; earlier < monthNumber; earlier += 1) {
    const key = `${year}-${String(earlier).padStart(2, '0')}`;
    const resolved = resolveMonthlyRate(rates, key);
    if (!resolved.explicit) fxFallbackMonths.push(key);
    taxableYearToDate = payMonth(
      entries,
      key,
      settings,
      resolved.rate,
      monthlyDays[key] ?? EMPTY_MONTHLY_DAYS,
      taxableYearToDate,
      params,
    ).payroll.taxableYearToDateAfter;
  }

  const targetRate = resolveMonthlyRate(rates, month);
  if (!targetRate.explicit) fxFallbackMonths.push(month);

  const result = payMonth(
    entries,
    month,
    settings,
    targetRate.rate,
    monthlyDays[month] ?? EMPTY_MONTHLY_DAYS,
    taxableYearToDate,
    params,
  );
  return { ...result, eurToKztRateUsed: targetRate.rate, fxFallbackMonths, ytdOverrideMonth };
}
