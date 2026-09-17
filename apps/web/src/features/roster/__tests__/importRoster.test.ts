import { describe, expect, it } from 'vitest';

import type { AimsDuty, AimsRoster } from '../aims';
import { mergeAimsRoster, parseAimsFile } from '../importRoster';

function duty(date: string, flightNumber: string, origin: string, destination: string): AimsDuty {
  return {
    date,
    report: `${date}T06:00`,
    release: `${date}T12:00`,
    flights: [{ flightNumber, date, origin, destination, departure: '07:00', arrival: '11:00', deadhead: false, actualTimes: false }],
  };
}

function roster(partial: Partial<AimsRoster> & Pick<AimsRoster, 'period'>): AimsRoster {
  return {
    duties: [], hotels: [], absences: [], activities: [], totals: {},
    importedAt: '2026-09-17T00:00:00.000Z',
    ...partial,
  };
}

/**
 * The September roster as a Web Archive would bring it: every day of the month accounted for,
 * whether it was flown or not.
 */
const september = roster({
  period: { start: '2026-09-01', end: '2026-09-30' },
  coverage: { start: '2026-09-01', end: '2026-09-30' },
  source: 'webarchive',
  duties: [duty('2026-09-04', 'KC855', 'ALA', 'NQZ'), duty('2026-09-28', 'KC921', 'NQZ', 'FRA')],
  activities: [{ date: '2026-09-01', code: 'OFF', type: '' }, { date: '2026-09-30', code: 'OFF', type: '' }],
  hotels: [{ station: 'FRA', name: 'Airport Hotel', phone: '+49 69' }],
});

/** The October roster as the published PDF brings it: one month, no hotel section on the report. */
const october = roster({
  period: { start: '2026-10-01', end: '2026-10-31' },
  source: 'pdf',
  duties: [duty('2026-10-02', 'KC187', 'ALA', 'CAN'), duty('2026-10-17', 'KC897', 'ALA', 'DXB')],
  absences: [{ code: 'VAC', date: '2026-10-05' }],
  activities: [{ date: '2026-10-01', code: 'HOMS', type: '' }, { date: '2026-10-31', code: 'OFF', type: '' }],
});

describe('mergeAimsRoster', () => {
  it('keeps both months when a PDF lands on top of a Web Archive', () => {
    const merged = mergeAimsRoster(september, october);

    expect(merged.duties.map((item) => item.date)).toEqual(['2026-09-04', '2026-09-28', '2026-10-02', '2026-10-17']);
    expect(merged.coverage).toEqual({ start: '2026-09-01', end: '2026-10-31' });
    // `period` stays the last import's, which is what the Pay screen opens on — the month the
    // pilot just brought in, not the oldest one still on file.
    expect(merged.period).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(merged.source).toBe('pdf');
  });

  it('replaces a shared day instead of listing it twice', () => {
    // The same week, imported as a PDF and then as an archive. A merge that appended would leave
    // Home showing one duty and the Roster showing it twice.
    const archiveAgain = roster({
      period: { start: '2026-10-01', end: '2026-10-31' },
      source: 'webarchive',
      duties: [duty('2026-10-02', 'KC187', 'ALA', 'CAN'), duty('2026-10-19', 'KC187', 'ALA', 'CAN')],
    });
    const merged = mergeAimsRoster(mergeAimsRoster(september, october), archiveAgain);

    expect(merged.duties.filter((item) => item.date === '2026-10-02')).toHaveLength(1);
    expect(merged.duties.map((item) => item.date)).toEqual(['2026-09-04', '2026-09-28', '2026-10-02', '2026-10-19']);
    // The 17th was on the PDF and is not on the archive, so the archive's reading of October wins:
    // a cancelled duty has to be able to disappear.
    expect(merged.duties.some((item) => item.date === '2026-10-17')).toBe(false);
    expect(merged.duties.some((item) => item.date === '2026-09-04')).toBe(true);
  });

  it('leaves alone the months an import declares but says nothing about', () => {
    // AIMS' saved page declares the whole calendar window it had open, even when only one month
    // of it was ever loaded. Taking that period at its word would delete an October the pilot had
    // imported from a PDF a minute earlier.
    const sparse = roster({
      period: { start: '2026-09-01', end: '2026-10-31' },
      source: 'webarchive',
      duties: [duty('2026-09-04', 'KC855', 'ALA', 'NQZ')],
    });
    const merged = mergeAimsRoster(mergeAimsRoster(september, october), sparse);

    // It covers the 4th and only the 4th, so the rest of September stands and so does October.
    expect(merged.duties.map((item) => item.date)).toEqual(['2026-09-04', '2026-09-28', '2026-10-02', '2026-10-17']);
    expect(merged.coverage).toEqual({ start: '2026-09-01', end: '2026-10-31' });
  });

  it('keeps hotels a source does not carry', () => {
    // The PDF report prints no hotel section, so importing one must not empty the address book
    // the Roster timeline reads a layover's hotel out of.
    const merged = mergeAimsRoster(september, october);
    expect(merged.hotels).toEqual([{ station: 'FRA', name: 'Airport Hotel', phone: '+49 69' }]);
  });

  it('merges absences and activities the same way as duties', () => {
    const merged = mergeAimsRoster(september, october);
    expect(merged.absences).toEqual([{ code: 'VAC', date: '2026-10-05' }]);
    expect(merged.activities.map((item) => item.date)).toEqual(['2026-09-01', '2026-09-30', '2026-10-01', '2026-10-31']);
  });

  it('records what one import on its own covers', () => {
    const merged = mergeAimsRoster(undefined, october);
    expect(merged.coverage).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('counts a day an entry only reaches into as covered', () => {
    // The last thing the October report says about the 31st is that the standby it starts on the
    // 30th runs until 09:00 that morning. That is still a claim about the 31st, so a later import
    // of October is entitled to replace it — and an under-claimed coverage would leave the
    // orphaned tail of this one behind.
    const overnight = roster({
      period: { start: '2026-10-01', end: '2026-10-31' },
      source: 'pdf',
      activities: [{ date: '2026-10-30', code: 'HOMS', type: '', start: '2026-10-30T21:00', end: '2026-10-31T09:00' }],
    });
    expect(mergeAimsRoster(undefined, overnight).coverage).toEqual({ start: '2026-10-30', end: '2026-10-31' });
  });
});

describe('parseAimsFile', () => {
  function file(bytes: Uint8Array): File {
    return {
      slice: (start: number, end: number) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer }),
      arrayBuffer: async () => bytes.buffer,
    } as unknown as File;
  }

  it('sends anything that is not a PDF to the Web Archive parser', async () => {
    // The archive parser's own error, which means the sniff routed the file rather than the PDF
    // reader trying to make sense of HTML.
    await expect(parseAimsFile(file(new TextEncoder().encode('<html>not a schedule</html>')))).rejects.toThrow(/Web Archive/);
  });

  it('routes a PDF away from the Web Archive parser', async () => {
    await expect(parseAimsFile(file(new TextEncoder().encode('%PDF-1.4 not really')))).rejects.not.toThrow(/Web Archive/);
  });
});
