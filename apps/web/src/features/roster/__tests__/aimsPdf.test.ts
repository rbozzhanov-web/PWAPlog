import type { ExtractedPage } from '@pilot-logbook/core/pdf-import';

import { parseAimsSchedulePdf } from '../aimsPdf';
import report from './__fixtures__/crewScheduleOct2026.json';

/**
 * A real "Personal Crew Schedule Report" — October 2026, three pages, as pdf.js extracts it.
 *
 * Only the crew names are substituted, letter for letter, so every item keeps the exact string
 * length, wrap point and coordinate the printed report had. The grid is read by x-position and
 * the crew table by how its fragments line up vertically, so that geometry is the thing under
 * test; a hand-built fixture would be testing the fixture.
 */
const pages = report as ExtractedPage[];
const roster = parseAimsSchedulePdf(pages);

describe('the October 2026 Crew Schedule Report', () => {
  it('reads the period and the report’s own hours', () => {
    expect(roster.period).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(roster.totals).toEqual({ blockMinutes: 3480, nightMinutes: 1420 });
    expect(roster.source).toBe('pdf');
  });

  it('gives flight numbers the KC prefix the Web Archive gives them', () => {
    // completedSectors.ts recognises a logged flight by date and airports, and Import AIMS keys a
    // written entry by date, flight number and airports. Either identity only survives the pilot
    // importing the same week twice, once per file type, if both parsers spell the sector the
    // same way.
    expect(roster.duties.flatMap((duty) => duty.flights).map((flight) => flight.flightNumber))
      .toEqual(['KC187', 'KC188', 'KC897', 'KC898', 'KC187', 'KC188', 'KC897', 'KC898', 'KC909', 'KC910']);
  });

  it('reads a sector that lands the next day as one flight, not two', () => {
    // KC187 leaves Almaty at 20:40 on the 2nd and reaches Canton at 05:35 on the 3rd. The report
    // prints the departure in one column and the arrival in the next, under a "↓".
    const [duty] = roster.duties;
    expect(duty.date).toBe('2026-10-02');
    expect(duty.flights).toHaveLength(1);
    expect(duty.flights[0]).toMatchObject({
      origin: 'ALA', departure: '20:40', destination: 'CAN', arrival: '05:35',
      date: '2026-10-02', arrivalDate: '2026-10-03', aircraftType: '763',
    });
    expect(duty.report).toBe('2026-10-02T19:10');
    expect(duty.release).toBe('2026-10-03T06:05');
  });

  it('files a duty under the day its flying starts, not the day it reports', () => {
    // Report 22:35 on the 26th for a departure at 00:05 on the 27th. The Web Archive dates that
    // duty by its sector, so Home’s "next duty" and the Roster timeline both expect the 27th.
    const duty = roster.duties.find((candidate) => candidate.report === '2026-10-26T22:35');
    expect(duty?.date).toBe('2026-10-27');
    expect(duty?.flights[0]).toMatchObject({ flightNumber: 'KC909', date: '2026-10-27', departure: '00:05' });
  });

  it('keeps a two-sector day as one duty with one report and one release', () => {
    const duty = roster.duties.find((candidate) => candidate.date === '2026-10-17');
    expect(duty?.flights.map((flight) => `${flight.origin}-${flight.destination}`)).toEqual(['ALA-DXB', 'DXB-ALA']);
    expect(duty?.report).toBe('2026-10-17T07:20');
    expect(duty?.release).toBe('2026-10-17T20:20');
  });

  it('counts leave as absences and names it from the report’s own code list', () => {
    const vacation = roster.absences.filter((absence) => absence.code === 'VAC');
    expect(vacation).toHaveLength(10);
    expect(vacation[0].date).toBe('2026-10-05');
    expect(roster.activities.find((activity) => activity.code === 'VAC')?.title).toBe('Leave');
    // The "Descriptions" page prints its second column on the same line, so reading the line
    // rather than the item names the day "Home Standby R - Requested".
    expect(roster.activities.find((activity) => activity.code === 'HOMS')?.title).toBe('Home Standby');
  });

  it('ends an overnight standby on the day it actually ends', () => {
    const standby = roster.activities.filter((activity) => activity.code === 'HOMS');
    expect(standby.map((activity) => [activity.start, activity.end])).toEqual([
      ['2026-10-01T09:00', '2026-10-01T21:00'],
      ['2026-10-15T21:00', '2026-10-16T09:00'],
      ['2026-10-30T21:00', '2026-10-31T09:00'],
    ]);
  });

  it('hangs the crew list on each sector, flight deck first', () => {
    const flight = roster.duties[0].flights[0];
    expect(flight.crew).toHaveLength(10);
    expect(flight.crew?.[0]).toMatchObject({ id: '9871', position: 'CP - PIC', role: 'Flight deck' });
    // A third pilot is flight deck, not cabin crew.
    const long = roster.duties.flatMap((duty) => duty.flights).find((candidate) => candidate.crew?.some((member) => member.position === '3P'));
    expect(long?.crew?.find((member) => member.position === '3P')?.role).toBe('Flight deck');
  });

  it('does not read the page header as the first flight’s crew', () => {
    // The crew table runs onto a second page, where the report reprints its title and period far
    // enough right to sit in the Details column. Glued to the fragment below them they swallow the
    // captain, who is the first name in it — so the flight loses exactly one crew member, and the
    // one whose name the screen leads with.
    const second = roster.duties.find((duty) => duty.date === '2026-10-19')?.flights[0];
    expect(second?.crew).toHaveLength(10);
    expect(second?.crew?.[0]).toMatchObject({ id: '9871', role: 'Flight deck' });
  });

  it('separates the two trips that share a flight number', () => {
    // KC187/KC188 fly twice this month. Other Crew dates a flight by its UTC departure and the
    // grid by the departure station’s clock, so the return leg’s row says the 21st while the grid
    // says the 22nd — close enough to match the wrong trip if the records were not used up.
    const returns = roster.duties.flatMap((duty) => duty.flights).filter((flight) => flight.flightNumber === 'KC188');
    expect(returns.map((flight) => flight.date)).toEqual(['2026-10-04', '2026-10-22']);
    expect(returns[0].crew?.[1]?.id).not.toBe(returns[1].crew?.[1]?.id);
  });

  it('rejects a PDF that is not this report', () => {
    const other: ExtractedPage[] = [{ width: 800, height: 600, items: [{ str: 'Boarding Pass', x: 10, y: 10, width: 60 }] }];
    expect(() => parseAimsSchedulePdf(other)).toThrow(/Personal Crew Schedule Report/);
  });
});
