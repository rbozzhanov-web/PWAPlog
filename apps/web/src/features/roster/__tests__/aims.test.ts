import { describe, expect, it } from 'vitest';
import { loadAimsRoster, parseAimsArchive } from '../aims';

const html = `<html><script>localStorage['PeriodStart'] = '2026-09-01';localStorage['PeriodEnd'] = '2026-09-30';var initialResult = {"SchedulerEvents":[{"start":"2026-09-12T07:00","end":"2026-09-12T14:00","report":"2026-09-12T06:00","debrief":"2026-09-12T14:30","type":"Flight","details":"922 - FRA (0830) - NQZ (0210⁺¹)","AircraftType":"A321"},{"start":"2026-09-15T00:00","type":"VAC","text":"VAC"},{"start":"2026-09-16T07:00","end":"2026-09-16T09:00","type":"Default","IsDeadhead":true,"details":"622 - NQZ (0800) - ALA (0940)"}],"elementList":[{"id":"hours","data":[{"desc":"Block","hours":"12:30"}]},{"id":"hotels","data":[{"port":"NQZ","addresses":"Hotel address","phones":"+7 700"}]}]};</script>CrewSchedule</html>`;

function archiveFile(source: string): File {
  return { arrayBuffer: async () => new TextEncoder().encode(source).buffer } as File;
}

describe('loadAimsRoster', () => {
  // A roster that already has the damage — stored before the merge stopped causing it — heals on
  // the next load, so the pilot does not have to re-import to stop paying twice for a sector.
  it('drops a duplicated sector a stored roster is already carrying', () => {
    const sector = { flightNumber: 'KC187', date: '2026-10-02', origin: 'ALA', destination: 'CAN', departure: '20:40', arrival: '05:35', deadhead: false, actualTimes: false };
    localStorage.setItem('pwaplog.aims-roster.v1', JSON.stringify({
      period: { start: '2026-10-01', end: '2026-10-31' },
      duties: [
        { date: '2026-10-02', report: '2026-10-02T19:10', flights: [sector] },
        { date: '2026-10-02', report: '2026-10-02T19:10', flights: [sector] },
        { date: '2026-10-17', flights: [{ ...sector, flightNumber: 'KC897', date: '2026-10-17', destination: 'DXB' }] },
      ],
      hotels: [], totals: {}, importedAt: '2026-09-18T00:00:00.000Z',
      absences: [{ code: 'VAC', date: '2026-10-05' }, { code: 'VAC', date: '2026-10-05' }],
      activities: [{ date: '2026-10-18', code: 'OFF', type: '' }, { date: '2026-10-18', code: 'OFF', type: '' }],
    }));

    const roster = loadAimsRoster();

    expect(roster?.duties.map((duty) => duty.date)).toEqual(['2026-10-02', '2026-10-17']);
    expect(roster?.absences).toHaveLength(1);
    expect(roster?.activities).toHaveLength(1);
  });

  it('keeps two real sectors that share a day', () => {
    const leg = (flightNumber: string, origin: string, destination: string) =>
      ({ flightNumber, date: '2026-10-17', origin, destination, departure: '08:50', arrival: '12:55', deadhead: false, actualTimes: false });
    localStorage.setItem('pwaplog.aims-roster.v1', JSON.stringify({
      period: { start: '2026-10-01', end: '2026-10-31' },
      duties: [{ date: '2026-10-17', flights: [leg('KC897', 'ALA', 'DXB'), leg('KC898', 'DXB', 'ALA')] }],
      hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-18T00:00:00.000Z',
    }));

    expect(loadAimsRoster()?.duties[0].flights).toHaveLength(2);
  });
});

describe('parseAimsArchive', () => {
  it('keeps operating, deadhead, absence and duty details locally', async () => {
    const roster = await parseAimsArchive(archiveFile(html));
    expect(roster.duties).toHaveLength(2);
    expect(roster.duties[0]).toMatchObject({ report: '2026-09-12T06:00', release: '2026-09-12T14:30' });
    expect(roster.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC922', arrivalDate: '2026-09-13', aircraftType: 'A321' });
    expect(roster.duties[1].flights[0].deadhead).toBe(true);
    expect(roster.absences).toEqual([{ code: 'VAC', date: '2026-09-15' }]);
    expect(roster.hotels[0].station).toBe('NQZ');
  });
  it('accepts the real Web Archive Events shape and clock-only duty times', async () => {
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult={};var Events=[{"start":"2026-09-04T10:40:00","end":"2026-09-04T17:24:00","report":"10:40","debrief":"17:24","type":"Flight","details":"921 - NQZ (A1217) - FRA (A1654)","IsDeadhead":false}];</script>CrewSchedule`;
    const roster = await parseAimsArchive(archiveFile(archive));
    expect(roster.duties[0]).toMatchObject({ report: '2026-09-04T10:40', release: '2026-09-04T17:24' });
    expect(roster.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC921', origin: 'NQZ', destination: 'FRA' });
  });

  // The real bug this guards: AIMS' saved page declares `charset=windows-1251`, but the bytes it
  // actually serves are UTF-8 — the only encoding that can represent the ⁺¹ overnight-rollover
  // mark a sector's own regex depends on. Trusting that declaration mangled the mark, which broke
  // the whole sector match and silently dropped the duty into "activities" instead of a flight.
  it('reads an overnight sector correctly even when the page misdeclares its charset as windows-1251', async () => {
    const archive = `<html><head><meta charset="windows-1251"></head><script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult = {"SchedulerEvents":[{"start":"2026-09-05T17:30:00","end":"2026-09-06T04:45:00","report":"17:30","debrief":"04:45","type":"Flight","IsDeadhead":false,"details":"922 - FRA (A1828) - NQZ (A0415⁺¹)"}]};</script>CrewSchedule</html>`;
    const roster = await parseAimsArchive(archiveFile(archive));
    expect(roster.duties).toHaveLength(1);
    expect(roster.duties[0].flights[0]).toMatchObject({
      flightNumber: 'KC922', origin: 'FRA', destination: 'NQZ',
      departure: '18:28', arrival: '04:15', arrivalDate: '2026-09-06',
    });
  });

  // The real bug this guards: a duty's own IsDeadhead flag applies to the whole event, but a
  // pilot can operate one leg of a multi-sector duty and deadhead home on the other — AIMS still
  // marks both sectors with the same flag. Confirmed against a real archive: this pilot operated
  // FRA-NQZ as CP but deadheaded the NQZ-ALA return, and trusting the event-level flag for both
  // undercounted the month's block hours by the whole operated leg. The per-sector crew list (via
  // whichever crew id every event in this schedule is filed under) carries the true, per-leg
  // answer and must win over that event-level flag.
  it("trusts each sector's own crew list over the duty's single deadhead flag", async () => {
    const initialResult = {
      SchedulerEvents: [{
        id: '1234on2026-09-12T17:30:00_x',
        start: '2026-09-12T17:30:00', end: '2026-09-13T08:54:00',
        report: '17:30', debrief: '08:54', type: 'Flight', IsDeadhead: true,
        details: '922  - FRA  (A1830) - NQZ  (A0435⁺¹) \r\n622  - NQZ  (A0709⁺¹) - ALA  (A0854⁺¹) ',
      }],
      elementList: [{ id: 'members', data: [
        { value: '12/09/2026 922 FRA - NQZ', data: [{ value2: 'SELF NAME', value3: 1234, value4: 'CP' }] },
        { value: '13/09/2026 622 NQZ - ALA', data: [{ value2: 'SELF NAME', value3: 1234, value4: 'CP - DHC' }] },
      ] }],
    };
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult = ${JSON.stringify(initialResult)};</script>CrewSchedule`;
    const roster = await parseAimsArchive(archiveFile(archive));
    const [operated, deadheaded] = roster.duties[0].flights;
    expect(operated).toMatchObject({ flightNumber: 'KC922', deadhead: false });
    expect(deadheaded).toMatchObject({ flightNumber: 'KC622', deadhead: true });
  });

  /**
   * The real bug this guards: AIMS gives a debrief as a bare clock, and hanging it on the duty's
   * start date puts the release before the report for every duty that ends after midnight. Nothing
   * showed it — the Roster and the hero both print the time and drop the date — until the hero
   * subtracted the two for a duty length and got a negative number, which it renders as a dash.
   */
  it('files a debrief after midnight on the day the duty actually ends', async () => {
    const initialResult = {
      SchedulerEvents: [{
        id: '1234on2026-09-25T18:25:00_x',
        start: '2026-09-25T18:25:00', end: '2026-09-26T00:35:00',
        report: '18:25', debrief: '00:35', type: 'Flight', IsDeadhead: false,
        details: '855  - ALA  (1940) - NQZ  (2125) \r\n856  - NQZ  (2225) - ALA  (0005\u207a\u00b9) ',
      }],
    };
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult = ${JSON.stringify(initialResult)};</script>CrewSchedule`;
    const roster = await parseAimsArchive(archiveFile(archive));

    expect(roster.duties[0].report).toBe('2026-09-25T18:25');
    expect(roster.duties[0].release).toBe('2026-09-26T00:35');
  });

  it('leaves a same-day debrief on the day it was given', async () => {
    const initialResult = {
      SchedulerEvents: [{
        id: '1234on2026-09-04T10:40:00_x',
        start: '2026-09-04T10:40:00', end: '2026-09-04T17:24:00',
        report: '10:40', debrief: '17:24', type: 'Flight', IsDeadhead: false,
        details: '921  - NQZ  (1217) - FRA  (1654) ',
      }],
    };
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult = ${JSON.stringify(initialResult)};</script>CrewSchedule`;

    expect((await parseAimsArchive(archiveFile(archive))).duties[0].release).toBe('2026-09-04T17:24');
  });

  // A long sector carries a third pilot, whose rank AIMS prints as "3P". Filed as cabin crew they
  // showed up under the flight attendants on the crew list, which is the wrong door.
  it('files a third pilot on the flight deck', async () => {
    const initialResult = {
      SchedulerEvents: [{
        id: '1234on2026-09-12T17:30:00_x',
        start: '2026-09-12T17:30:00', end: '2026-09-13T08:54:00',
        report: '17:30', debrief: '08:54', type: 'Flight',
        details: '922  - FRA  (1830) - NQZ  (0435\u207a\u00b9) ',
      }],
      elementList: [{ id: 'members', data: [
        { value: '12/09/2026 922 FRA - NQZ', data: [
          { value2: 'SELF NAME', value3: 1234, value4: 'CP' },
          { value2: 'RELIEF PILOT', value3: 5112, value4: '3P' },
          { value2: 'CABIN LEAD', value3: 8726, value4: 'PU' },
        ] },
      ] }],
    };
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult = ${JSON.stringify(initialResult)};</script>CrewSchedule`;
    const roster = await parseAimsArchive(archiveFile(archive));
    expect(roster.duties[0].flights[0].crew?.map((member) => [member.position, member.role])).toEqual([
      ['CP', 'Flight deck'], ['3P', 'Flight deck'], ['PU', 'Cabin'],
    ]);
  });

  /**
   * The real bug this guards: AIMS prints "A" against a time only where it differs from the
   * schedule, so a sector that pushed back exactly on time shows a bare departure and no "Flight
   * delay" line. Requiring an "A" on both ends read those as not yet flown and kept them out of
   * the logbook entirely — two of the six operated sectors in the September sample, with nothing
   * on screen to say they were missing. Confirmed with the pilot: both left on schedule.
   */
  it('treats an on-time departure as flown, and an unflown sector as not', async () => {
    const events = [
      // Departed exactly on schedule, landed late: bare departure, actual arrival, no delay line.
      { start: '2026-09-08T17:30:00', end: '2026-09-09T04:50:00', report: '17:30', debrief: '04:50', type: 'Flight', IsDeadhead: false, details: '922 - FRA (1830) - NQZ (A0420⁺¹)' },
      // Departed late: both ends actual, and AIMS records the delay.
      { start: '2026-09-04T10:40:00', end: '2026-09-04T17:24:00', report: '10:40', debrief: '17:24', type: 'Flight', IsDeadhead: false, details: '921 - NQZ (A1217) - FRA (A1654)\r\nFlight delay: 00:07' },
      // Still to come: nothing has happened, so neither end is actual.
      { start: '2026-09-25T18:25:00', end: '2026-09-26T00:35:00', report: '18:25', debrief: '00:35', type: 'Flight', IsDeadhead: false, details: '855 - ALA (1940) - NQZ (2125)' },
      // In the air: it left late, so the departure is actual, but the arrival is still the plan.
      { start: '2026-09-27T17:30:00', end: '2026-09-28T04:50:00', report: '17:30', debrief: '04:50', type: 'Flight', IsDeadhead: false, details: '922 - FRA (A1845) - NQZ (0420⁺¹)' },
    ];
    const archive = `<script>localStorage['PeriodStart']='2026-09-01';localStorage['PeriodEnd']='2026-09-30';var initialResult=${JSON.stringify({ SchedulerEvents: events })};</script>CrewSchedule`;

    const flights = (await parseAimsArchive(archiveFile(archive))).duties.flatMap((duty) => duty.flights);

    expect(flights.map((flight) => [flight.date, flight.flightNumber, flight.actualTimes])).toEqual([
      ['2026-09-04', 'KC921', true],
      ['2026-09-08', 'KC922', true],
      ['2026-09-25', 'KC855', false],
      ['2026-09-27', 'KC922', false],
    ]);
    // The on-time departure is the time actually flown, so it is safe to block from.
    expect(flights[1]).toMatchObject({ departure: '18:30', arrival: '04:20', arrivalDate: '2026-09-09' });
  });
});
