import { ExtractedPage } from '../../pdf-import/types';

import { parseCrewSchedule } from '../scheduleParser';

function item(str: string, x: number, y = 0) {
  return { str, x, y, width: 10 };
}

function schedulePage(): ExtractedPage {
  const headers = Array.from({ length: 31 }, (_, index) => item(`${String(index + 1).padStart(2, '0')}/05`, 30 + index * 25));
  return {
    width: 842,
    height: 595,
    items: [
      item('Personal Crew Schedule Report', 20),
      item('01/05/2026 - 31/05/2026', 250),
      ...headers,
      item('VAC', 30 + 5 * 25, 70), // Wednesday 06/05
      item('VAC', 30 + 9 * 25, 70), // Sunday 10/05 - not paid
      item('VAC', 30 + 11 * 25, 70), // Tuesday 12/05
      item('MEDA', 30 + 15 * 25, 70),
      item('MED3', 30 + 16 * 25, 70),
      item('GRTC', 30 + 18 * 25, 70),
      item('ASM1', 30 + 19 * 25, 70),
    ],
  };
}

// Condensed real "Personal Crew Schedule Report" export for BOZZHANOV RAMIL, ALA-CP-763, June
// 2026 (positions taken verbatim from the actual PDF's pdf.js-style text items, trimmed to the
// rows that drive parsing -- day headers, duty codes, and the last airport of each day -- since
// the crew-list table at the bottom of the page carries no parsing-relevant data). The title is
// deliberately split into four separate items ("Personal" / "Crew" / "Schedule" / "Report"), as
// it is in the real PDF, to exercise the isScheduleReportPage fix below.
//
// OPC on 07/06 and SIMT on 08/06 are the only explicitly-coded training days, but the trip itself
// runs 06/06 (positioning flight ALA->FRA) through 10/06 (return FRA->NQZ->ALA overnight
// 09/06-10/06) -- confirmed against the pilot's real payslip, which paid 5 training days, and
// against the report's own Hotel Information table (FRA nights booked 06/06, 08/06, 09/06).
function realJunePage(): ExtractedPage {
  const dayHeaders = Array.from({ length: 30 }, (_, index) =>
    item(`${String(index + 1).padStart(2, '0')}/06`, 18.93 + index * 26.05, 103.09)
  );
  const x = (day: number) => 18.93 + (day - 1) * 26.05;

  return {
    width: 842,
    height: 595,
    items: [
      item('Personal', 292.52, 22.04),
      item('Crew', 353.78, 22.04),
      item('Schedule', 391.53, 22.04),
      item('Report', 455.19, 22.04),
      item('01/06/2026', 274.5, 55.03),
      item('-', 335.13, 55.03),
      item('30/06/2026', 341.52, 55.03),
      item('9871', 17.22, 86.28),
      item('BOZZHANOV', 37.49, 86.28),
      item('RAMIL', 87.73, 86.28),
      item('ALA-CP-763', 114.35, 86.28),
      ...dayHeaders,
      // 01/06-05/06: at home (OFF/HOMX/AVLB), no training -- classify() would say 'home'.
      item('OFF', x(1), 122.49),
      item('HOMX', x(2), 122.49),
      item('OFF', x(3), 122.49),
      item('OFF', x(4), 122.49),
      item('AVLB', x(5), 122.49),
      // 06/06: positioning flight ALA -> FRA (flight 221), the trip's start.
      item('221', x(6) + 5, 138.8),
      item('ALA', x(6) - 10, 155.12),
      item('FRA', x(6) + 10, 163.28),
      // 07/06: OPC at FRA (explicitly coded training day).
      item('OPC', x(7), 138.8),
      item('FRA', x(7), 179.6),
      // 08/06: SIMT at FRA (explicitly coded training day).
      item('SIMT', x(8), 179.6),
      item('FRA', x(8), 179.6),
      // 09/06: DOFF (Day Off Downroute) -- still away from base, per the report's own legend.
      item('DOFF', x(9), 122.49),
      item('FRA', x(9), 163.28),
      // 10/06: return flight FRA -> NQZ -> ALA overnight, arriving back home.
      item('622', x(10) - 5, 138.8),
      item('NQZ', x(10) - 20, 130.64),
      item('ALA', x(10), 155.12),
      // 11/06: unrelated same-day round trip ALA<->AYT -- must NOT be swept into the trip.
      item('AYT', x(11) - 10, 155.12),
      item('ALA', x(11) + 10, 155.12),
      item('OFF', x(12), 122.49),
      // Section boundary that scopes duty-code/airport detection to the calendar grid only.
      item('Total', 17.97, 351.18),
      item('Hours', 37.75, 351.18),
      item('and', 60.4, 351.18),
      item('Statistics', 75.52, 351.18),
    ],
  };
}

describe('parseCrewSchedule', () => {
  it('turns roster codes into salary day counts without creating logbook data', () => {
    expect(parseCrewSchedule([schedulePage()])).toMatchObject({
      month: '2026-05',
      // 3 calendar VAC days (Wed/Sun/Tue), but the Sunday one doesn't count toward vacationPay.
      days: { vacationDays: 3, paidVacationDays: 2, medicalExamDays: 2, trainingDays: 2 },
    });
  });

  it('pays the whole away-from-base trip around a real training event, not just the coded days', () => {
    const result = parseCrewSchedule([realJunePage()]);

    expect(result.month).toBe('2026-06');
    // 06/06 positioning flight out, 07/06 OPC, 08/06 SIMT, 09/06-10/06 return -- 5 days total,
    // matching the real payslip's e028 Обучение пилотов line.
    expect(result.days.trainingDays).toBe(5);

    const trainingDates = result.matchedCodes.filter((entry) => entry.payItem === 'training').map((entry) => entry.date);
    expect(trainingDates).toEqual(['2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09', '2026-06-10']);
  });

  it('reads every flight leg, including one that lands after midnight in the next day’s column', () => {
    // Positions taken verbatim from the real June 2026 PDF's pdf.js text items: 221 (ALA->FRA,
    // same-day), then 922 (FRA->NQZ) landing after midnight -- its NQZ arrival airport prints at
    // the top of 10/06's column, after the "↓" continuation marker, not under 09/06 where it
    // departed -- and 622 (NQZ->ALA) right after it, same day.
    const dayHeaders = Array.from({ length: 30 }, (_, index) =>
      item(`${String(index + 1).padStart(2, '0')}/06`, 18.93 + index * 26.05, 108.85)
    );
    const page: ExtractedPage = {
      width: 842,
      height: 595,
      items: [
        item('Personal', 292.52, 22.04),
        item('Crew', 353.78, 22.04),
        item('Schedule', 391.53, 22.04),
        item('Report', 455.19, 22.04),
        item('01/06/2026', 274.5, 55.03),
        item('-', 335.13, 55.03),
        item('30/06/2026', 341.52, 55.03),
        ...dayHeaders,
        // 06/06: 221 ALA -> FRA, same day.
        item('10:45', 150.73, 127.55),
        item('221', 153.37, 143.86),
        item('A11:51', 148.8, 152.02),
        item('*ALA', 151.49, 160.18),
        item('FRA', 153.16, 168.34),
        item('A16:55', 148.8, 176.5),
        // 09/06: 922 FRA -> (continues overnight).
        item('↓', 233.79, 127.55),
        item('03:20', 228.98, 135.71),
        item('17:30', 228.96, 152.02),
        item('922', 231.6, 168.34),
        item('A19:26', 227.03, 176.5),
        item('*FRA', 229.71, 184.66),
        item('→', 233.79, 192.82),
        // 10/06: 922's NQZ arrival lands here, then 622 NQZ -> ALA.
        item('↓', 259.71, 127.55),
        item('NQZ', 256.62, 135.71),
        item('A05:28', 252.95, 143.86),
        item('622', 257.51, 160.18),
        item('A07:09', 252.95, 168.34),
        item('*NQZ', 254.94, 176.5),
        item('ALA', 257.32, 184.66),
        item('A08:51', 252.95, 192.82),
        item('Total', 17.97, 351.18),
        item('Hours', 37.75, 351.18),
        item('and', 60.4, 351.18),
        item('Statistics', 75.52, 351.18),
      ],
    };

    const result = parseCrewSchedule([page]);

    expect(result.sectors).toEqual([
      { date: '2026-06-06', departureAirport: 'ALA', arrivalAirport: 'FRA', totalTimeMinutes: 0 },
      { date: '2026-06-09', departureAirport: 'FRA', arrivalAirport: 'NQZ', totalTimeMinutes: 0 },
      { date: '2026-06-10', departureAirport: 'NQZ', arrivalAirport: 'ALA', totalTimeMinutes: 0 },
    ]);
  });

  it('keeps a flight that departs the month’s last day and lands in next month’s spillover column', () => {
    // Real June 2026 roster: 922 departs FRA on 30/06 and lands NQZ after midnight, in the 01/07
    // column the grid prints at its right edge. CrewPay norm hours only reconcile against the real
    // payslip (45.95h) once this leg is counted — omitting it understates the month by 26 minutes.
    const dayHeaders = Array.from({ length: 31 }, (_, index) =>
      item(`${String((index % 30) + 1).padStart(2, '0')}/${index < 30 ? '06' : '07'}`, 18.93 + index * 26.05, 108.85)
    );
    const page: ExtractedPage = {
      width: 842,
      height: 595,
      items: [
        item('Personal Crew Schedule Report', 292.52, 22.04),
        item('01/06/2026', 274.5, 55.03),
        item('-', 335.13, 55.03),
        item('30/06/2026', 341.52, 55.03),
        ...dayHeaders,
        // 30/06: 922 FRA -> (continues overnight).
        item('922', 778.73, 143.86),
        item('A18:38', 774.16, 152.02),
        item('FRA', 778.52, 160.18),
        item('→', 780.92, 168.34),
        // 01/07 (next month's spillover column): 922's NQZ arrival lands here.
        item('↓', 806.36, 127.55),
        item('NQZ', 803.5, 135.71),
        item('A04:33', 799.84, 143.86),
        item('Total Hours and Statistics', 17.97, 357.51),
      ],
    };

    const result = parseCrewSchedule([page]);

    expect(result.sectors).toEqual([
      { date: '2026-06-30', departureAirport: 'FRA', arrivalAirport: 'NQZ', totalTimeMinutes: 0 },
    ]);
  });

  it('drops a leg the pilot deadheaded on rather than operated', () => {
    // Real June 2026 payslip: CrewPay norm hours only reconcile (45.95h) once these three
    // positioning legs of the training trip (flown as PAX -- see the "Other Crew" table, verbatim
    // below) are excluded; counting them implies 57.93h, 26% over what was actually paid.
    const dayHeaders = Array.from({ length: 30 }, (_, index) =>
      item(`${String(index + 1).padStart(2, '0')}/06`, 18.93 + index * 26.05, 108.85)
    );
    const gridPage: ExtractedPage = {
      width: 842,
      height: 595,
      items: [
        item('Personal Crew Schedule Report', 292.52, 22.04),
        item('9871 BOZZHANOV RAMIL ALA-CP-763', 17.22, 93.03),
        item('01/06/2026', 274.5, 55.03),
        item('-', 335.13, 55.03),
        item('30/06/2026', 341.52, 55.03),
        ...dayHeaders,
        item('221', 153.37, 143.86),
        item('*ALA', 151.49, 160.18),
        item('FRA', 153.16, 168.34),
        item('922', 231.6, 168.34),
        item('*FRA', 229.71, 184.66),
        item('↓', 259.71, 127.55),
        item('NQZ', 256.62, 135.71),
        item('622', 257.51, 160.18),
        item('*NQZ', 254.94, 176.5),
        item('ALA', 257.32, 184.66),
        item('Total Hours and Statistics', 17.97, 357.51),
      ],
    };
    // The "Other Crew" table, verbatim from the real report's second page (no calendar grid here).
    const otherCrewPage: ExtractedPage = {
      width: 842,
      height: 595,
      items: [
        item('06/06/2026', 18.72, 94.56),
        item('221', 95.14, 94.56),
        item(
          'CP - PIC - 10080 - ARALBAY ALEM | FO - 12230 - RABBANI MD RISALAT | IS - 3679 - POLONSKAYA OLGA | PU - 13976 - DAULETBEKOV DASTAN | FJ - 8969 - DIKHANBAY SYMBAT | FJ - 16446 -',
          172.34,
          89.41,
        ),
        item(
          'MAMBETOVA NADIRA | FY - 13682 - MLIZAT ANAR | FY - 17133 - ZHOLDYBAY AIDANA | CP - PAX - 9871 - BOZZHANOV RAMIL | FO - PAX - 13356 - KURMANKULOV SHAKHNAZAR',
          172.34,
          99.71,
        ),
        item('09/06/2026', 18.72, 122.1),
        item('922', 95.14, 122.1),
        item(
          'CP - PIC - 12537 - KERNEIBEK DAUREN | FO - 12632 - KADYRBEKOV ALDAN | IS - 8199 - MUKHAMADIYEVA ASSEL | PU - 13065 - AMANGELDIYEVA ZHANELYA | FJ - 14526 - AMANZHOLOVA',
          172.34,
          111.81,
        ),
        item(
          'MOLDIR | FJ - 14546 - RAMAZANOV AIDYN | FY - 8970 - MURZASHOVA ALBINA | FY - 9575 - TUSSUPOVA MARZHAN | FY - 14439 - MAUTOVA AIIZA | FY - 14513 - BALGUZHINA MALIKE | CP',
          172.34,
          122.1,
        ),
        item('- PAX - 5066 - KUZMIN ALEXEY | CP - PAX - 9871 - BOZZHANOV RAMIL | FO - PAX - 13356 - KURMANKULOV SHAKHNAZAR', 172.34, 132.4),
        item('10/06/2026', 18.72, 154.8),
        item('622', 95.14, 154.8),
        item(
          'CP - PIC - 13192 - MACHADO ANGEL | FO - 15057 - ZHUMAGUL AIBOL | IS - 9269 - AIMAGANBETOVA TOLGANAY | PU - 13529 - ZHAFARKULOVA AINUR | FJ - 7024 - NURTAIKYZY BAGZHAN |',
          172.34,
          144.5,
        ),
        item(
          'FJ - 13357 - ALIPBEK ASSEL | FY - 14497 - OMIRGALIYEVA AINUR | FY - 16625 - SHYNUAR NAZERKE | PS - 4120 - SHAKHMETOVA ZHANNA | CP - PAX - 5066 - KUZMIN ALEXEY | CP - PAX -',
          172.34,
          154.8,
        ),
        item('9871 - BOZZHANOV RAMIL | FO - PAX - 13356 - KURMANKULOV SHAKHNAZAR', 172.34, 165.1),
      ],
    };

    const result = parseCrewSchedule([gridPage, otherCrewPage]);

    expect(result.sectors).toEqual([]);
  });
});
