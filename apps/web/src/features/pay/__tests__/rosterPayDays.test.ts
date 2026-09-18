/// <reference types="vitest/globals" />

import type { AimsActivity, AimsDuty, AimsFlight, AimsRoster } from '../../roster/aims';
import { payDaysForMonth, payMonthsFromRoster } from '../rosterPayDays';

function flight(date: string, origin: string, destination: string, partial: Partial<AimsFlight> = {}): AimsFlight {
  return {
    flightNumber: 'KC999', date, origin, destination,
    departure: '10:00', arrival: '14:00', deadhead: false, actualTimes: false,
    ...partial,
  };
}
function duty(date: string, flights: AimsFlight[]): AimsDuty {
  return { date, report: `${date}T09:00`, flights };
}
function code(date: string, value: string): AimsActivity {
  return { date, code: value, type: '' };
}
function roster(partial: Partial<AimsRoster> & Pick<AimsRoster, 'period'>): AimsRoster {
  return { duties: [], hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-06-30T00:00:00.000Z', ...partial };
}

describe('payDaysForMonth', () => {
  it('counts every calendar leave day but pays for the ones that are not Sundays', () => {
    // Air Astana's own roster/payroll example of 06–12 May counts six VAC days, not seven.
    const may = roster({
      period: { start: '2026-05-01', end: '2026-05-31' },
      absences: [
        { code: 'VAC', date: '2026-05-06' }, // Wednesday
        { code: 'VAC', date: '2026-05-10' }, // Sunday — not paid
        { code: 'VAC', date: '2026-05-12' }, // Tuesday
      ],
    });

    expect(payDaysForMonth(may, '2026-05')).toMatchObject({ vacationDays: 3, paidVacationDays: 2 });
  });

  it('reads medical-exam and training codes off the roster', () => {
    const may = roster({
      period: { start: '2026-05-01', end: '2026-05-31' },
      activities: [code('2026-05-16', 'MEDA'), code('2026-05-17', 'MED3'), code('2026-05-19', 'GRTC'), code('2026-05-20', 'ASM1')],
    });

    // GRTC and ASM1 are consecutive and neither has a flight or a duty code around it, so nothing
    // extends the trip past the two coded days themselves.
    expect(payDaysForMonth(may, '2026-05')).toMatchObject({ medicalExamDays: 2, trainingDays: 2 });
  });

  it('ignores a month that is not the one asked for', () => {
    const spanning = roster({
      period: { start: '2026-05-01', end: '2026-06-30' },
      absences: [{ code: 'VAC', date: '2026-05-06' }, { code: 'VAC', date: '2026-06-03' }],
    });

    expect(payDaysForMonth(spanning, '2026-06').vacationDays).toBe(1);
  });
});

/**
 * The real June 2026 trip, as the roster holds it. Air Astana paid it as five training days —
 * the payslip's "Обучение пилотов" line — although only two days carry a training code: the trip
 * is positioning out on the 6th, OPC on the 7th, SIMT on the 8th, Day Off Downroute on the 9th,
 * and the overnight home on the 9th–10th. The report's own Hotel Information table agrees,
 * booking Frankfurt for the nights of the 6th, 8th and 9th.
 */
const june = roster({
  period: { start: '2026-06-01', end: '2026-06-30' },
  duties: [
    duty('2026-06-06', [flight('2026-06-06', 'ALA', 'FRA', { flightNumber: 'KC221' })]),
    // Home overnight: leaves Frankfurt on the 9th, lands in Astana and then Almaty on the 10th.
    duty('2026-06-09', [
      flight('2026-06-09', 'FRA', 'NQZ', { flightNumber: 'KC922', arrivalDate: '2026-06-10', departure: '18:30', arrival: '04:20' }),
      flight('2026-06-10', 'NQZ', 'ALA', { flightNumber: 'KC622', departure: '07:09', arrival: '08:54' }),
    ]),
    // An unrelated same-day round trip the day after, which must not be swept into the trip.
    duty('2026-06-11', [
      flight('2026-06-11', 'ALA', 'AYT', { departure: '08:00', arrival: '12:30' }),
      flight('2026-06-11', 'AYT', 'ALA', { departure: '13:30', arrival: '22:00' }),
    ]),
  ],
  activities: [
    code('2026-06-01', 'OFF'), code('2026-06-02', 'HOMX'), code('2026-06-03', 'OFF'),
    code('2026-06-04', 'OFF'), code('2026-06-05', 'AVLB'),
    code('2026-06-07', 'OPC'), code('2026-06-08', 'SIMT'),
    code('2026-06-09', 'DOFF'), code('2026-06-12', 'OFF'),
  ],
});

describe('a training event is paid as the whole trip around it', () => {
  it('pays the June trip as five days, not the two that carry a code', () => {
    expect(payDaysForMonth(june, '2026-06').trainingDays).toBe(5);
  });

  it('stops at the day the pilot got home', () => {
    // The 10th is in — it is the day the trip ends — and the 11th is not, although it is a flying
    // day: the walk takes one home day and stops.
    const stripped = { ...june, activities: june.activities.filter((activity) => activity.date !== '2026-06-12') };
    expect(payDaysForMonth(stripped, '2026-06').trainingDays).toBe(5);
  });

  it('does not extend a training day the pilot spent at base', () => {
    const atBase = roster({
      period: { start: '2026-06-01', end: '2026-06-30' },
      activities: [code('2026-06-03', 'OFF'), code('2026-06-04', 'GRTC'), code('2026-06-05', 'OFF')],
    });

    expect(payDaysForMonth(atBase, '2026-06').trainingDays).toBe(1);
  });
});

describe('payMonthsFromRoster', () => {
  it('offers every month the roster says anything about', () => {
    const twoMonths = roster({
      period: { start: '2026-06-01', end: '2026-07-31' },
      duties: [duty('2026-06-06', [flight('2026-06-06', 'ALA', 'FRA')])],
      activities: [code('2026-07-02', 'OFF')],
    });

    // ИПН bands on the cumulative year, so the replay wants every month the roster can answer for
    // — a month of nothing but days off still says the pilot earned their salary and flew nothing.
    expect(payMonthsFromRoster(twoMonths).map((source) => source.month)).toEqual(['2026-06', '2026-07']);
  });

  it('leaves out the legs the pilot only rode on', () => {
    const withDeadhead = roster({
      period: { start: '2026-06-01', end: '2026-06-30' },
      duties: [duty('2026-06-06', [
        flight('2026-06-06', 'ALA', 'FRA', { deadhead: true }),
        flight('2026-06-06', 'FRA', 'NQZ'),
      ])],
    });

    expect(payMonthsFromRoster(withDeadhead)[0].sectors).toEqual([
      { date: '2026-06-06', departureAirport: 'FRA', arrivalAirport: 'NQZ', totalTimeMinutes: 0 },
    ]);
  });

  it('keeps each month to its own sectors', () => {
    const twoMonths = roster({
      period: { start: '2026-06-01', end: '2026-07-31' },
      duties: [duty('2026-06-06', [flight('2026-06-06', 'ALA', 'FRA')]), duty('2026-07-02', [flight('2026-07-02', 'ALA', 'NQZ')])],
    });

    expect(payMonthsFromRoster(twoMonths).map((source) => source.sectors.length)).toEqual([1, 1]);
    expect(payMonthsFromRoster(twoMonths)[1].sectors[0].arrivalAirport).toBe('NQZ');
  });
});
