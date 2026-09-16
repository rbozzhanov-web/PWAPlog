import { describe, expect, it } from 'vitest';

import { EMPTY_PAY_SETTINGS, calculatePayPeriod, type PaySector, type PaySettings } from '../payPeriod';

/**
 * ИПН is banded on cumulative taxable income, so what `calculatePayPeriod` is handed about the
 * *earlier* months of the year decides which band the month on screen lands in. These pin the two
 * ways that can go wrong silently — the Pay screen used to do both.
 */

const settings: PaySettings = {
  ...EMPTY_PAY_SETTINGS,
  monthlySalaryEur: 11_000,
  hourlyRateEur: 40,
  nightAllowanceEur: 400,
};

// A year of flying to September, two sectors a month on a route with a published norm.
const sectors: PaySector[] = [];
for (let month = 1; month <= 9; month += 1) {
  const key = `2026-${String(month).padStart(2, '0')}`;
  sectors.push({ date: `${key}-04`, departureAirport: 'ALA', arrivalAirport: 'NQZ', totalTimeMinutes: 105 });
  sectors.push({ date: `${key}-05`, departureAirport: 'NQZ', arrivalAirport: 'ALA', totalTimeMinutes: 100 });
}

const RATE = 530;
const everyMonth = Object.fromEntries(
  Array.from({ length: 9 }, (_, index) => [`2026-${String(index + 1).padStart(2, '0')}`, RATE]),
);

describe('calculatePayPeriod across the year', () => {
  it('charges more tax once the earlier months are actually priced', () => {
    const wholeYear = calculatePayPeriod(sectors, '2026-09', settings, everyMonth);
    // What the screen used to send: a rates map holding only the month on display. Every earlier
    // month then resolves to a rate of 0, so a year of euro-denominated pay replays as nearly
    // nothing and September stays in the bottom band.
    const targetMonthOnly = calculatePayPeriod(sectors, '2026-09', settings, { '2026-09': RATE });

    expect(wholeYear.payroll.taxableIncome).toBeCloseTo(targetMonthOnly.payroll.taxableIncome, 6);
    expect(targetMonthOnly.payroll.taxedAtUpperRate).toBe(0);
    expect(wholeYear.payroll.taxedAtUpperRate).toBeGreaterThan(0);
    expect(wholeYear.payroll.ipn).toBeGreaterThan(targetMonthOnly.payroll.ipn);
  });

  it('names every month it had to borrow a rate for', () => {
    const targetMonthOnly = calculatePayPeriod(sectors, '2026-09', settings, { '2026-09': RATE });

    expect(targetMonthOnly.fxFallbackMonths).toEqual([
      '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08',
    ]);
    expect(calculatePayPeriod(sectors, '2026-09', settings, everyMonth).fxFallbackMonths).toEqual([]);
  });

  it('starts from a taxable YTD off a payslip instead of replaying, and says which month', () => {
    const replayed = calculatePayPeriod(sectors, '2026-09', settings, everyMonth);
    // A figure read off the July payslip stands in for January through June, so those months are
    // never replayed — and their rates are never needed.
    const fromJulyOnwards = { '2026-07': RATE, '2026-08': RATE, '2026-09': RATE };
    const fromPayslip = calculatePayPeriod(sectors, '2026-09', settings, fromJulyOnwards, {}, undefined, {
      '2026-07': 2_000_000,
    });

    expect(fromPayslip.ytdOverrideMonth).toBe('2026-07');
    expect(fromPayslip.fxFallbackMonths).toEqual([]);
    // The payslip says the year is far behind where a replay from January put it, so September
    // falls back into the lower band and is taxed less.
    expect(fromPayslip.payroll.taxedAtUpperRate).toBeLessThan(replayed.payroll.taxedAtUpperRate);
    expect(fromPayslip.payroll.ipn).toBeLessThan(replayed.payroll.ipn);
  });
});
