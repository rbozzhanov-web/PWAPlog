import {
  EMPTY_PAY_SETTINGS,
  PaySettings,
  calculatePayPeriod,
  entriesForMonth,
  resolveMonthlyRate,
} from '../payPeriod';
import { FlightLogEntry } from '../../logbook/types';

function flight(date: string, from: string, to: string, minutes: number): FlightLogEntry {
  return {
    id: `${date}${from}${to}`,
    date,
    departureAirport: from,
    arrivalAirport: to,
    totalTimeMinutes: minutes,
    picMinutes: 0,
    sicMinutes: minutes,
    dualReceivedMinutes: 0,
    dualGivenMinutes: 0,
    soloMinutes: 0,
    dayMinutes: minutes,
    nightMinutes: 0,
    actualInstrumentMinutes: 0,
    simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0,
    simulatorMinutes: 0,
    dayTakeoffs: 1,
    nightTakeoffs: 0,
    dayLandings: 1,
    nightLandings: 0,
    instrumentApproaches: 0,
    source: 'pdf_import',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function simulator(date: string): FlightLogEntry {
  return {
    ...flight(date, 'UAAA', 'UAAA', 0),
    id: `sim${date}`,
    simulatorMinutes: 240,
    simulatorType: 'VPTI',
    dayMinutes: 0,
    sicMinutes: 0,
    dayLandings: 0,
    dayTakeoffs: 0,
  };
}

// A round rate makes the arithmetic easy to check by hand.
const RATE = 500;

const SETTINGS: PaySettings = {
  ...EMPTY_PAY_SETTINGS,
  hourlyRateEur: 100,
  monthlySalaryEur: 2000,
  transportAllowance: 78_000, // already tenge — must not be touched by any rate
};

describe('entriesForMonth', () => {
  it('keeps only that month', () => {
    const entries = [flight('2026-07-10', 'UAAA', 'UACC', 120), flight('2026-08-10', 'UAAA', 'UACC', 120)];

    expect(entriesForMonth(entries, '2026-07')).toHaveLength(1);
  });

  it('leaves simulator sessions out — they are not flying and earn no flight pay', () => {
    const entries = [flight('2026-07-10', 'UAAA', 'UACC', 120), simulator('2026-07-12')];

    expect(entriesForMonth(entries, '2026-07')).toHaveLength(1);
  });
});

describe('resolveMonthlyRate', () => {
  it('uses the month’s own rate when there is one', () => {
    expect(resolveMonthlyRate({ '2026-07': 545.32 }, '2026-07')).toEqual({
      rate: 545.32,
      explicit: true,
    });
  });

  it('borrows the nearest earlier month of the same year', () => {
    const rates = { '2026-03': 520, '2026-05': 530 };

    expect(resolveMonthlyRate(rates, '2026-06')).toEqual({ rate: 530, explicit: false });
  });

  it('never borrows a later month, and never crosses a year boundary', () => {
    // December of the previous year has a rate; nothing in 2026 does yet.
    const rates = { '2025-12': 480, '2026-08': 560 };

    expect(resolveMonthlyRate(rates, '2026-03')).toEqual({ rate: 0, explicit: false });
  });

  it('defaults to 0 when nothing has ever been entered', () => {
    expect(resolveMonthlyRate({}, '2026-01')).toEqual({ rate: 0, explicit: false });
  });
});

describe('calculatePayPeriod — EUR conversion', () => {
  // January throughout, so the replay never reaches back before the target month and each test
  // isolates the one thing it names rather than also exercising the fallback-reporting path.
  it('converts the euro-denominated lines at the month’s rate', () => {
    const entries = [flight('2026-01-10', 'UAAA', 'UACC', 200)]; // ALA->NQZ norm 1:55 = 115 min

    const result = calculatePayPeriod(entries, '2026-01', SETTINGS, { '2026-01': RATE });

    expect(result.earnings.salary).toBe(SETTINGS.monthlySalaryEur * RATE);
    expect(result.earnings.flightPay).toBeCloseTo((115 / 60) * SETTINGS.hourlyRateEur * RATE, 6);
    expect(result.eurToKztRateUsed).toBe(RATE);
    expect(result.fxFallbackMonths).toEqual([]);
  });

  it('leaves the tenge-denominated allowance untouched by the rate', () => {
    const result = calculatePayPeriod([], '2026-01', SETTINGS, { '2026-01': RATE });

    expect(result.earnings.transportAllowance).toBe(SETTINGS.transportAllowance);
  });

  it('pays an Astana departure on its own published norm regardless of currency', () => {
    const entries = [flight('2026-01-10', 'UACC', 'UAAA', 200)];

    const result = calculatePayPeriod(entries, '2026-01', SETTINGS, { '2026-01': RATE });

    // NQZ->ALA is 1:53 (113 min), distinct from ALA->NQZ's 1:55 — the hours side is unaffected by
    // the currency change, only how those hours are priced.
    expect(result.hours.normMinutes).toBe(113);
    expect(result.hours.actualMinutes).toBe(0);
  });

  it('reports the month as a fallback when its own rate is missing, and uses 0', () => {
    // With no rate entered anywhere in the year, every month up to and including the target
    // replays as a fallback — the replay is honest about how little it actually knows here.
    const result = calculatePayPeriod([], '2026-01', SETTINGS, {});

    expect(result.eurToKztRateUsed).toBe(0);
    expect(result.earnings.salary).toBe(0);
    expect(result.fxFallbackMonths).toEqual(['2026-01']);
  });

  it('falls back to the nearest earlier rate in the year rather than zeroing the month', () => {
    // January and February have their own rate; March onward do not, so April and May (the
    // target) both borrow March's — the value entered nearest to, but not after, each of them.
    const rates = { '2026-01': 500, '2026-02': 500, '2026-03': 520 };
    const result = calculatePayPeriod([], '2026-05', SETTINGS, rates);

    expect(result.eurToKztRateUsed).toBe(520);
    expect(result.earnings.salary).toBe(SETTINGS.monthlySalaryEur * 520);
    expect(result.fxFallbackMonths).toEqual(['2026-04', '2026-05']);
  });
});

describe('calculatePayPeriod — the annual replay uses each month’s own rate', () => {
  it('taxes the year correctly even though the rate moved between months', () => {
    // Identical flying every month, but the rate rises through the year — a stronger tenge
    // early on, weaker later. If the replay used today's rate for earlier months instead of
    // each month's own, the accumulated taxable base — and therefore the ИПН band — would be
    // wrong for every month after the first.
    const heavy = (month: string) =>
      Array.from({ length: 20 }, (_, i) =>
        flight(`2026-${month}-${String(i + 1).padStart(2, '0')}`, 'UAAA', 'EGLL', 578),
      );
    const entries = Array.from({ length: 6 }, (_, i) => heavy(String(i + 1).padStart(2, '0'))).flat();
    const rates = { '2026-01': 500, '2026-02': 500, '2026-03': 500, '2026-04': 500, '2026-05': 500, '2026-06': 500 };

    const atUniformRate = calculatePayPeriod(entries, '2026-06', SETTINGS, rates);
    const withJump = calculatePayPeriod(entries, '2026-06', SETTINGS, { ...rates, '2026-01': 300 });

    // Only January's rate differs between the two runs. Income is heavy enough that June's own
    // ИПН is already saturated at the upper rate in both runs, so the visible difference is in
    // the year-to-date base June carries forward — exactly the number a January-only change must
    // move if the replay is using each month's own rate rather than today's for every month.
    expect(withJump.payroll.taxableYearToDateAfter).not.toBe(atUniformRate.payroll.taxableYearToDateAfter);
    expect(withJump.fxFallbackMonths).toEqual([]);
  });

  it('starts January from a clean slate rather than carrying the previous year in', () => {
    const entries = [flight('2026-01-10', 'UAAA', 'UACC', 120)];

    const result = calculatePayPeriod(entries, '2026-01', SETTINGS, { '2026-01': RATE });

    expect(result.payroll.taxedAtUpperRate).toBe(0);
  });
});

describe('calculatePayPeriod — a known year-to-date figure overrides replaying from January', () => {
  // A logbook missing earlier months (a pilot who just started using the app, or hasn't imported
  // everything yet) would otherwise replay them as zero and understate every later month's ИПН —
  // see the real June 2026 payslip that surfaced this: the app taxed June entirely at 10% because
  // it had no January–May entries, when the real payslip's own cumulative figure put June partway
  // into the 15% band.
  const rates = { '2026-06': RATE };

  it('uses the override as the starting point instead of 0, with no earlier months replayed', () => {
    const withoutOverride = calculatePayPeriod([], '2026-06', SETTINGS, rates);
    const withOverride = calculatePayPeriod([], '2026-06', SETTINGS, rates, {}, undefined, { '2026-06': 30_000_000 });

    expect(withoutOverride.payroll.taxableYearToDateAfter).toBeLessThan(withOverride.payroll.taxableYearToDateAfter);
    // June's own taxableIncome is unaffected by the override — only the band it lands in is.
    expect(withOverride.payroll.taxableYearToDateAfter - 30_000_000).toBeCloseTo(
      withoutOverride.payroll.taxableYearToDateAfter,
      6,
    );
    expect(withOverride.ytdOverrideMonth).toBe('2026-06');
    expect(withoutOverride.ytdOverrideMonth).toBeUndefined();
  });

  it('replays only the months after the latest override, not all the way from January', () => {
    const entries = [flight('2026-05-10', 'UAAA', 'UACC', 200)]; // would move May's own taxable base
    const rates2 = { '2026-04': RATE, '2026-05': RATE, '2026-06': RATE };

    const result = calculatePayPeriod([], '2026-06', SETTINGS, rates2, {}, undefined, {
      '2026-04': 10_000_000,
    });

    // April's override is used as-is; May and June are the only months actually replayed from the
    // logbook — May's flight above would change the outcome, proving it was not skipped.
    const withMayFlight = calculatePayPeriod(entries, '2026-06', SETTINGS, rates2, {}, undefined, {
      '2026-04': 10_000_000,
    });
    expect(withMayFlight.payroll.taxableYearToDateAfter).not.toBe(result.payroll.taxableYearToDateAfter);
    expect(result.ytdOverrideMonth).toBe('2026-04');
  });

  it('falls back to replaying from January when no override applies', () => {
    const result = calculatePayPeriod([], '2026-06', SETTINGS, rates, {}, undefined, {});

    expect(result.ytdOverrideMonth).toBeUndefined();
  });
});

describe('calculatePayPeriod — routing that does not involve currency', () => {
  it('routes the 5% corporate pension to all four places a payslip puts it, in tenge throughout', () => {
    const withPension = { ...SETTINGS, corporatePensionRate: 0.05 };
    const entries = [flight('2026-01-10', 'UAAA', 'UACC', 120)];
    const rates = { '2026-01': RATE };

    const plain = calculatePayPeriod(entries, '2026-01', SETTINGS, rates);
    const pensioned = calculatePayPeriod(entries, '2026-01', withPension, rates);

    // The pension base is regularGross net of the transport allowance and ОПВ. SETTINGS has no
    // pension rate, so plain.earnings.total already equals regularGross with no indirect income
    // mixed in — including ОПВ, which at these low test earnings is a plain 10%, well under its
    // ceiling.
    const opv = Math.min(plain.earnings.total, 50 * 85_000) * 0.1;
    const contribution = (plain.earnings.total - plain.earnings.transportAllowance - opv) * 0.05;
    expect(pensioned.earnings.indirectIncome).toBeCloseTo(contribution, 6);
    expect(pensioned.earnings.total).toBeCloseTo(plain.earnings.total + contribution, 6);
    expect(pensioned.payroll.voluntaryPension).toBeCloseTo(contribution, 6);
    expect(pensioned.payroll.otherDeductions).toBeCloseTo(plain.payroll.otherDeductions + contribution, 6);
    expect(pensioned.payroll.netPay).toBeLessThan(plain.payroll.netPay);
  });

  it('withholds alimony as a rate on income after statutory deductions, not on gross', () => {
    const withAlimony = { ...SETTINGS, alimonyRate: 0.5 };
    const entries = [flight('2026-01-10', 'UAAA', 'UACC', 120)];
    const rates = { '2026-01': RATE };

    const plain = calculatePayPeriod(entries, '2026-01', SETTINGS, rates);
    const alimonied = calculatePayPeriod(entries, '2026-01', withAlimony, rates);

    expect(alimonied.payroll.alimony).toBeGreaterThan(0);
    expect(alimonied.payroll.totalDeductions).toBeCloseTo(
      plain.payroll.totalDeductions + alimonied.payroll.alimony,
      6,
    );
    // Earnings themselves are untouched by alimony — only the deduction side changes.
    expect(alimonied.earnings.total).toBe(plain.earnings.total);
  });

  it('produces a month with no flying without crashing or inventing pay', () => {
    const result = calculatePayPeriod([], '2026-07', SETTINGS, { '2026-07': RATE });

    expect(result.hours.totalMinutes).toBe(0);
    expect(result.earnings.flightPay).toBe(0);
    // Salary (converted) plus the fixed transport allowance — the only two lines still nonzero.
    expect(result.earnings.total).toBe(SETTINGS.monthlySalaryEur * RATE + SETTINGS.transportAllowance);
  });
});

describe('calculatePayPeriod — the three per-day accruals are tenge, untouched by the FX rate', () => {
  const withRates = {
    ...SETTINGS,
    vacationDayRateTenge: 250_042.3,
    trainingDayRateTenge: 160_114.59,
    medicalExamDayRateTenge: 250_042.3,
  };

  it('multiplies each day-rate by that month’s day count, with no currency conversion at all', () => {
    const days = { '2026-01': { vacationDays: 6, paidVacationDays: 6, trainingDays: 1, medicalExamDays: 1 } };

    // A dramatic rate is deliberate: if the code multiplied by eurToKztRate anywhere in this
    // path, these figures would come out enormous rather than matching the real payslip numbers.
    const result = calculatePayPeriod([], '2026-01', withRates, { '2026-01': 999 }, days);

    expect(result.earnings.vacationPay).toBeCloseTo(250_042.3 * 6, 6);
    expect(result.earnings.trainingPay).toBeCloseTo(160_114.59, 6);
    expect(result.earnings.medicalExamPay).toBeCloseTo(250_042.3, 6);
  });

  it('defaults to zero days, and zero pay, for a month with no entry at all', () => {
    const result = calculatePayPeriod([], '2026-01', withRates, { '2026-01': RATE }, {});

    expect(result.earnings.vacationPay).toBe(0);
    expect(result.earnings.trainingPay).toBe(0);
    expect(result.earnings.medicalExamPay).toBe(0);
  });

  it('does not borrow a day count from a neighbouring month, unlike the FX rate', () => {
    const days = { '2026-02': { vacationDays: 6, paidVacationDays: 6, trainingDays: 0, medicalExamDays: 0 } };
    const rates = { '2026-01': RATE, '2026-02': RATE, '2026-03': RATE };

    const result = calculatePayPeriod([], '2026-03', withRates, rates, days);

    // March has no days of its own, and must not inherit February's — 0 is the correct default
    // for a month nothing was entered for, not a guess to flag.
    expect(result.earnings.vacationPay).toBe(0);
    expect(result.fxFallbackMonths).toEqual([]);
  });

  it('prorates salary and night allowance, but not productivity, by days actually on the roster', () => {
    // Real June 2026 payslip: e001 Оклад 3 078 098 for 25 (of June's 30) days, alongside 5 training
    // days paid separately through e028. If salary counted all 30 days, it would come to 3 693 718.
    // Productivity did NOT shrink the same way: a real July 2026 payslip with zero training or
    // vacation days still paid less than settings.productivityAllowanceEur × rate would suggest
    // (181 500 ₸, only explained if the true monthly figure is 333.33 EUR) — proof it isn't
    // prorated by roster days at all, unlike salary and night.
    const settings: PaySettings = {
      ...EMPTY_PAY_SETTINGS,
      hourlyRateEur: 34,
      monthlySalaryEur: 6667,
      nightAllowanceEur: 2221,
      productivityAllowanceEur: 300,
      transportAllowance: 78_000,
    };
    const rate = 554.03;
    const days = { '2026-06': { vacationDays: 0, paidVacationDays: 0, trainingDays: 5, medicalExamDays: 0 } };
    const rosterFraction = (30 - 5) / 30;

    const result = calculatePayPeriod([], '2026-06', settings, { '2026-06': rate }, days);

    expect(result.earnings.salary).toBeCloseTo(settings.monthlySalaryEur * rate * rosterFraction, 6);
    expect(result.earnings.nightAllowance).toBeCloseTo(settings.nightAllowanceEur * rate * rosterFraction, 6);
    expect(result.earnings.productivityAllowance).toBeCloseTo(settings.productivityAllowanceEur * rate, 6);
    expect(result.earnings.salary).toBeCloseTo(3_078_098, 0);
  });

  it('leaves salary, night and productivity at their full-month figures for a roster with no unpaid days', () => {
    // Real July 2026 payslip: e001 Оклад 3 630 181 for all 31 days (no training or vacation that
    // month), е015 ночные 1 209 879,04, е015 продуктивность 181 500 — the same 333.33 EUR/month
    // productivity figure as June, confirming it holds regardless of roster days.
    const settings: PaySettings = {
      ...EMPTY_PAY_SETTINGS,
      monthlySalaryEur: 6667,
      nightAllowanceEur: 2221,
      productivityAllowanceEur: 1_000 / 3,
    };
    const rate = 544.5;

    const result = calculatePayPeriod([], '2026-07', settings, { '2026-07': rate }, {});

    expect(result.earnings.salary).toBeCloseTo(6_667 * rate, 6);
    expect(result.earnings.nightAllowance).toBeCloseTo(2_221 * rate, 6);
    expect(result.earnings.productivityAllowance).toBeCloseTo(181_500, 0);
  });

  it('prorates salary and night by the raw calendar vacation count, and zeroes productivity, on a month with a vacation', () => {
    // Real January 2026 payslip: e001 Оклад 2 697 483 for 21 (of January's 31) days — a 10-day
    // vacation block (15th-24th), all 10 calendar days excluded from salary even though one of
    // them (18th) was a Sunday and so doesn't count toward vacationPay itself (paidVacationDays 9,
    // per the May example). Productivity ("Доплата за продуктивность") was absent from the
    // payslip entirely that month.
    const settings: PaySettings = {
      ...EMPTY_PAY_SETTINGS,
      monthlySalaryEur: 6667,
      nightAllowanceEur: 2221,
      productivityAllowanceEur: 1_000 / 3,
    };
    const rate = 597.27;
    const days = { '2026-01': { vacationDays: 10, paidVacationDays: 9, trainingDays: 0, medicalExamDays: 0 } };
    const rosterFraction = (31 - 10) / 31;

    const result = calculatePayPeriod([], '2026-01', settings, { '2026-01': rate }, days);

    expect(result.earnings.salary).toBeCloseTo(settings.monthlySalaryEur * rate * rosterFraction, 6);
    expect(result.earnings.nightAllowance).toBeCloseTo(settings.nightAllowanceEur * rate * rosterFraction, 6);
    expect(result.earnings.productivityAllowance).toBe(0);
    expect(result.earnings.salary).toBeCloseTo(2_697_483, 0);
  });

  it('still feeds regularGross — and therefore the КорпПП line — net of the salary it displaces and ОПВ', () => {
    const days = { '2026-01': { vacationDays: 6, paidVacationDays: 6, trainingDays: 0, medicalExamDays: 0 } };
    const withPension = { ...withRates, corporatePensionRate: 0.05 };

    const withoutDays = calculatePayPeriod([], '2026-01', withPension, { '2026-01': RATE }, {});
    const withDays = calculatePayPeriod([], '2026-01', withPension, { '2026-01': RATE }, days);

    // January has 31 days. 6 vacation days are paid through vacationPay, not salary — so those
    // same 6 days must come back out of the accrued salary, or the pilot is paid for them twice.
    const vacationPay = 250_042.3 * 6;
    const salaryLostToVacation = withPension.monthlySalaryEur * RATE * (6 / 31);
    expect(withDays.earnings.salary).toBeCloseTo(withoutDays.earnings.salary - salaryLostToVacation, 6);

    // regularGross (pre-pension) is fully determined by salary, transport and vacationPay here —
    // nothing else in this scenario is nonzero — so each run's own ОПВ can be derived the same way
    // `calculateEarnings` estimates it, without reaching into internals.
    const opvCap = 50 * 85_000;
    const regularGrossWithoutDays = withPension.monthlySalaryEur * RATE + withPension.transportAllowance;
    const regularGrossWithDays = regularGrossWithoutDays - salaryLostToVacation + vacationPay;
    const opvWithoutDays = Math.min(regularGrossWithoutDays, opvCap) * 0.1;
    const opvWithDays = Math.min(regularGrossWithDays, opvCap) * 0.1;

    const pensionableWithoutDays = regularGrossWithoutDays - withPension.transportAllowance - opvWithoutDays;
    const pensionableWithDays = regularGrossWithDays - withPension.transportAllowance - opvWithDays;

    expect(withoutDays.earnings.indirectIncome).toBeCloseTo(pensionableWithoutDays * 0.05, 6);
    expect(withDays.earnings.indirectIncome).toBeCloseTo(pensionableWithDays * 0.05, 6);
  });
});
