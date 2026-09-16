/// <reference types="vitest/globals" />

import { buildPayInputs, sourcesByMonth, withFormValues } from '../payInputs';

const sector = (date: string, from = 'ALA', to = 'NQZ') => ({
  date, departureAirport: from, arrivalAirport: to, totalTimeMinutes: 105,
});
const days = (vacationDays: number) => ({ vacationDays, paidVacationDays: vacationDays, trainingDays: 0, medicalExamDays: 0 });

describe('buildPayInputs', () => {
  it('gathers every month it has a source for, not just the one on screen', () => {
    const inputs = buildPayInputs([
      [{ month: '2026-07', sectors: [sector('2026-07-04')], days: days(2) }],
      [{ month: '2026-09', sectors: [sector('2026-09-04')], days: days(0) }],
      sourcesByMonth([sector('2026-05-11'), sector('2026-05-12')]),
    ]);

    expect(inputs.months).toEqual(['2026-05', '2026-07', '2026-09']);
    expect(inputs.sectors).toHaveLength(4);
    expect(inputs.monthlyDays['2026-07']).toEqual(days(2));
  });

  it('takes the first tier that has a month, so a PDF beats the roster and the roster beats the logbook', () => {
    const inputs = buildPayInputs([
      [{ month: '2026-09', sectors: [sector('2026-09-01', 'PDF', 'PDF')] }],
      [{ month: '2026-09', sectors: [sector('2026-09-01', 'AIM', 'AIM')] }],
      sourcesByMonth([sector('2026-09-01', 'LOG', 'LOG')]),
    ]);

    expect(inputs.sectors).toEqual([expect.objectContaining({ departureAirport: 'PDF' })]);
  });

  it("lets the pilot's explicit choice win for the month being calculated", () => {
    const inputs = buildPayInputs(
      [[
        { month: '2026-09', sectors: [sector('2026-09-01', 'PDF', 'PDF')] },
        { month: '2026-08', sectors: [sector('2026-08-01', 'PDF', 'PDF')] },
      ]],
      { month: '2026-09', sectors: [sector('2026-09-01', 'AIM', 'AIM')], days: days(1) },
    );

    // The override replaces September only — August still resolves through the ladder.
    expect(inputs.sectors.map((item) => item.departureAirport)).toEqual(['PDF', 'AIM']);
    expect(inputs.monthlyDays['2026-09']).toEqual(days(1));
  });

  it('gives a month with no day figures an empty set rather than dropping it', () => {
    const inputs = buildPayInputs([sourcesByMonth([sector('2026-03-02')])]);
    expect(inputs.monthlyDays['2026-03']).toEqual({ vacationDays: 0, paidVacationDays: 0, trainingDays: 0, medicalExamDays: 0 });
  });
});

describe('sourcesByMonth', () => {
  it('ignores an entry whose date could not make a month key', () => {
    expect(sourcesByMonth([sector('not-a-date')])).toEqual([]);
  });
});

describe('withFormValues', () => {
  it('lets what is typed override what is stored for that month', () => {
    expect(withFormValues({ '2026-08': 520, '2026-09': 530 }, '2026-09', 545))
      .toEqual({ '2026-08': 520, '2026-09': 545 });
  });

  it('removes the month when the field is empty, rather than sending a zero', () => {
    // Core reads a defined 0 as "no taxable income before this month" — a real claim, not a blank.
    expect(withFormValues({ '2026-09': 1_000 }, '2026-09', undefined)).toEqual({});
  });

  it('leaves the stored map alone when there is no month yet', () => {
    const stored = { '2026-09': 530 };
    expect(withFormValues(stored, undefined, 545)).toBe(stored);
  });
});
