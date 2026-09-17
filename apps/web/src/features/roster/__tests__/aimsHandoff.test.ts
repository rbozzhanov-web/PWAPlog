import { describe, expect, it } from 'vitest';

import { parseAimsArchive } from '../aims';
import { decodeHandoff, encodeHandoff, aimsBookmarklet, aimsHandoffScript, aimsShortcutScript, rosterFromHandoff, HANDOFF_VERSION } from '../aimsHandoff';

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

/**
 * These run the script rather than reading it. Shortcuts reports one thing however the script
 * fails — "a valid URL is required" — and shows nothing about why, so what matters is not that the
 * source looks right but that every path really does end in a URL this app can open.
 */
describe('the script the pilot runs on the AIMS page', () => {
  const ORIGIN = 'https://pwaplog.pages.dev';
  const shortcut = aimsShortcutScript(ORIGIN);
  const bookmarklet = aimsHandoffScript(ORIGIN);

  /** Drives the script the way Shortcuts' "Run JavaScript on Web Page" action does. */
  function runShortcut(): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the script never called completion()')), 5000);
      new Function('completion', `return ${shortcut}`)((url: string) => { clearTimeout(timer); resolve(url); });
    });
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.PeriodStart = '2026-09-01';
    localStorage.PeriodEnd = '2026-09-30';
    (window as unknown as { initialResult?: unknown }).initialResult = schedule;
  });
  afterEach(() => {
    delete (window as unknown as { initialResult?: unknown }).initialResult;
    vi.unstubAllGlobals();
  });

  it('hands back a link the app can open, and the roster survives it', async () => {
    const url = await runShortcut();

    expect(url.startsWith(`${ORIGIN}/import/aims#r=`)).toBe(true);
    const roster = await rosterFromHandoff(url.split('#r=')[1]);
    expect(roster.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC921', origin: 'NQZ', destination: 'FRA' });
  });

  it('sends the schedule uncompressed rather than failing when it cannot compress', async () => {
    // A long link that works beats a clean error.
    vi.stubGlobal('CompressionStream', undefined);

    const url = await runShortcut();

    expect(url.startsWith(`${ORIGIN}/import/aims#j=`)).toBe(true);
    const roster = await rosterFromHandoff(url.split('#j=')[1], false);
    expect(roster.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC921' });
  });

  it('comes back with the reason when the page has no schedule on it yet', async () => {
    delete (window as unknown as { initialResult?: unknown }).initialResult;

    const url = await runShortcut();

    expect(url.startsWith(`${ORIGIN}/import/aims#e=`)).toBe(true);
    expect(decodeURIComponent(url.split('#e=')[1])).toMatch(/let it finish loading/);
  });

  it('calls completion exactly once, so a late watchdog cannot overwrite a good link', async () => {
    const seen: string[] = [];
    new Function('completion', `return ${shortcut}`)((url: string) => seen.push(url));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('#r=');
  });

  it('reads only what the page already exposes, and names no URL but this app', () => {
    for (const script of [shortcut, bookmarklet]) {
      expect(script).toContain('window.initialResult');
      expect(script).toContain('localStorage.PeriodStart');
      // No credentials, no tokens, no third party.
      expect(script.match(/https?:\/\/[^'"]+/g)).toEqual([`${ORIGIN}/import/aims`]);
    }
  });

  it('delivers its answer the way each route needs', () => {
    // Shortcuts rejects a script that navigates; a Safari bookmark has nothing to hand back to.
    expect(shortcut).toContain('completion(u)');
    expect(shortcut).not.toContain('location.href');
    expect(bookmarklet).toContain('location.href = u');
    expect(bookmarklet).not.toContain('completion(');
  });

  it('folds into a bookmarklet Safari will accept', () => {
    const folded = aimsBookmarklet(ORIGIN);
    expect(folded.startsWith('javascript:')).toBe(true);
    expect(folded).not.toMatch(/\n/);
    expect(decodeURIComponent(folded.slice('javascript:'.length))).toContain('initialResult');
  });
});
