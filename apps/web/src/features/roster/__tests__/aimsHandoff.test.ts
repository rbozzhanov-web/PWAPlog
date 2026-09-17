import { describe, expect, it } from 'vitest';

import { parseAimsArchive } from '../aims';
import { decodeHandoff, encodeHandoff, aimsBookmarklet, aimsHandoffScript, rosterFromHandoff, HANDOFF_VERSION } from '../aimsHandoff';

const schedule = {
  SchedulerEvents: [
    {
      start: '2026-09-04T10:40:00', end: '2026-09-04T17:24:00', report: '10:40', debrief: '17:24',
      type: 'Flight', IsDeadhead: false, AircraftType: 'A321',
      details: '921  - NQZ  (A1217) - FRA  (A1654)',
    },
    { start: '2026-09-15T00:00', type: 'VAC', text: 'VAC' },
  ],
  elementList: [{ id: 'hours', data: [{ desc: 'Block Hours', hours: '7:37' }] }],
};

const handoff = { v: HANDOFF_VERSION, result: schedule, periodStart: '2026-09-01', periodEnd: '2026-09-30' };

/** The same schedule as a saved Web Archive, so the two import paths can be compared. */
const archive = `<html><script>localStorage['PeriodStart'] = '2026-09-01';localStorage['PeriodEnd'] = '2026-09-30';var initialResult = ${JSON.stringify(schedule)};</script>CrewSchedule</html>`;
const archiveFile = { arrayBuffer: async () => new TextEncoder().encode(archive).buffer } as File;

describe('the AIMS handoff payload', () => {
  it('survives the trip through the fragment', async () => {
    expect(await decodeHandoff(await encodeHandoff(handoff))).toEqual(handoff);
  });

  it('compresses a real month into something a URL can carry', async () => {
    // A month of sectors is ~55 KB of JSON, which does not survive being URL-encoded into a link.
    const big = { ...handoff, result: { ...schedule, SchedulerEvents: Array.from({ length: 60 }, () => schedule.SchedulerEvents[0]) } };
    const encoded = await encodeHandoff(big);
    expect(encoded.length).toBeLessThan(JSON.stringify(big).length / 4);
    // base64url only, so the fragment needs no escaping at all.
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('builds the same roster the saved archive does', async () => {
    const fromArchive = await parseAimsArchive(archiveFile);
    const fromPage = await rosterFromHandoff(await encodeHandoff(handoff));

    // importedAt is the moment of import, so it is the one field that must differ.
    expect({ ...fromPage, importedAt: '' }).toEqual({ ...fromArchive, importedAt: '' });
    expect(fromPage.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC921', origin: 'NQZ', destination: 'FRA' });
  });

  it('says so plainly when a link is damaged, stale or empty', async () => {
    await expect(rosterFromHandoff('not-base64url-gzip')).rejects.toThrow(/damaged/i);
    await expect(rosterFromHandoff(await encodeHandoff({ ...handoff, v: 99 }))).rejects.toThrow(/different version/i);
    await expect(rosterFromHandoff(await encodeHandoff({ ...handoff, result: undefined as never })))
      .rejects.toThrow(/handed over no schedule/i);
  });
});

describe('the script the pilot runs on the AIMS page', () => {
  const script = aimsHandoffScript('https://pwaplog.pages.dev');

  it('reads only what the page already exposes, and sends it only to this app', () => {
    expect(script).toContain('window.initialResult');
    expect(script).toContain('localStorage.PeriodStart');
    expect(script).toContain("location.href = 'https://pwaplog.pages.dev/import/aims#r='");
    // No credentials, no tokens, no third party: the only URL in it is this app's own.
    expect(script.match(/https?:\/\/[^'"]+/g)).toEqual(['https://pwaplog.pages.dev/import/aims#r=']);
  });

  it('folds into a bookmarklet Safari will accept', () => {
    const bookmarklet = aimsBookmarklet('https://pwaplog.pages.dev');
    expect(bookmarklet.startsWith('javascript:')).toBe(true);
    expect(bookmarklet).not.toMatch(/\n/);
    expect(decodeURIComponent(bookmarklet.slice('javascript:'.length))).toContain('initialResult');
  });
});
