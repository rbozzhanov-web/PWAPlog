import { describe, expect, it } from 'vitest';
import { parseAimsArchive } from '../aims';

const html = `<html><script>localStorage['PeriodStart'] = '2026-09-01';localStorage['PeriodEnd'] = '2026-09-30';var initialResult = {"SchedulerEvents":[{"start":"2026-09-12T07:00","end":"2026-09-12T14:00","report":"2026-09-12T06:00","debrief":"2026-09-12T14:30","type":"Flight","details":"922 - FRA (0830) - NQZ (0210⁺¹)","AircraftType":"A321"},{"start":"2026-09-15T00:00","type":"VAC","text":"VAC"},{"start":"2026-09-16T07:00","end":"2026-09-16T09:00","type":"Default","IsDeadhead":true,"details":"622 - NQZ (0800) - ALA (0940)"}],"elementList":[{"id":"hours","data":[{"desc":"Block","hours":"12:30"}]},{"id":"hotels","data":[{"port":"NQZ","addresses":"Hotel address","phones":"+7 700"}]}]};</script>CrewSchedule</html>`;

describe('parseAimsArchive', () => {
  it('keeps operating, deadhead, absence and duty details locally', async () => {
    const roster = await parseAimsArchive({ arrayBuffer: async () => new TextEncoder().encode(html).buffer } as File);
    expect(roster.duties).toHaveLength(2);
    expect(roster.duties[0]).toMatchObject({ report: '2026-09-12T06:00', release: '2026-09-12T14:30' });
    expect(roster.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC922', arrivalDate: '2026-09-13', aircraftType: 'A321' });
    expect(roster.duties[1].flights[0].deadhead).toBe(true);
    expect(roster.absences).toEqual([{ code: 'VAC', date: '2026-09-15' }]);
    expect(roster.hotels[0].station).toBe('NQZ');
  });
});
