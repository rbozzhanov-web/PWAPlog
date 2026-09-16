import { describe, expect, it } from 'vitest';
import { parseAimsArchive } from '../aims';

const html = `<html><script>localStorage['PeriodStart'] = '2026-09-01';localStorage['PeriodEnd'] = '2026-09-30';var initialResult = {"SchedulerEvents":[{"start":"2026-09-12T07:00","end":"2026-09-12T14:00","report":"2026-09-12T06:00","debrief":"2026-09-12T14:30","type":"Flight","details":"922 - FRA (0830) - NQZ (0210⁺¹)","AircraftType":"A321"},{"start":"2026-09-15T00:00","type":"VAC","text":"VAC"},{"start":"2026-09-16T07:00","end":"2026-09-16T09:00","type":"Default","IsDeadhead":true,"details":"622 - NQZ (0800) - ALA (0940)"}],"elementList":[{"id":"hours","data":[{"desc":"Block","hours":"12:30"}]},{"id":"hotels","data":[{"port":"NQZ","addresses":"Hotel address","phones":"+7 700"}]}]};</script>CrewSchedule</html>`;

function archiveFile(source: string): File {
  return { arrayBuffer: async () => new TextEncoder().encode(source).buffer } as File;
}

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
});
