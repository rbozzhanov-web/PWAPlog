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

/**
 * These run the script rather than reading it. Shortcuts reports one thing however the script
 * fails — "a valid URL is required" — and shows nothing about why, so what matters is not that the
 * source looks right but that every path really does end in a URL this app can open.
 */
describe('the script the pilot runs on the AIMS page', () => {
  const ORIGIN = 'https://pwaplog.pages.dev';
  // One script serves both routes: it navigates and it calls completion.
  const script = aimsHandoffScript(ORIGIN);

  /** Drives the script the way the Shortcuts action does, and refuses to wait for it. */
  function runShortcut(): string | undefined {
    let url: string | undefined;
    new Function('completion', `return ${script}`)((u: string) => { url = u; });
    return url;
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.PeriodStart = '2026-09-01';
    localStorage.PeriodEnd = '2026-09-30';
    (window as unknown as { initialResult?: unknown }).initialResult = schedule;
  });
  afterEach(() => {
    delete (window as unknown as { initialResult?: unknown }).initialResult;
  });

  it('hands back a link the app can open, and the roster survives it', async () => {
    const url = runShortcut()!;

    expect(url.startsWith(`${ORIGIN}/import/aims#j=`)).toBe(true);
    const roster = await rosterFromHandoff(url.split('#j=')[1], false);
    expect(roster.duties[0].flights[0]).toMatchObject({ flightNumber: 'KC921', origin: 'NQZ', destination: 'FRA' });
  });

  /**
   * The bug this guards is the one that cost several rounds on a real phone: the action finished
   * before a promise callback could run, so it reported an empty result and then, once the script
   * navigated from inside that callback instead, did nothing whatsoever.
   */
  it('finishes inside the call, without waiting for a turn of the event loop', () => {
    // Nothing is awaited and no timer is allowed to run: whatever comes back, comes back now.
    expect(runShortcut()).toContain('#j=');
  });

  it('comes back with the reason when the page has no schedule on it yet', () => {
    delete (window as unknown as { initialResult?: unknown }).initialResult;

    const url = runShortcut()!;

    expect(url.startsWith(`${ORIGIN}/import/aims#e=`)).toBe(true);
    expect(decodeURIComponent(url.split('#e=')[1])).toMatch(/let it finish loading/);
  });

  it('calls completion exactly once', async () => {
    const seen: string[] = [];
    new Function('completion', `return ${script}`)((url: string) => seen.push(url));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain('#j=');
  });

  it('drops what the roster parser never reads, to keep the link as short as it can be', () => {
    const url = runShortcut()!;
    const sent = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(url.split('#j=')[1].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
    ));

    expect(sent.result.elementList.map((e: { id: string }) => e.id)).toEqual(['hours']);
    expect(JSON.stringify(sent)).not.toContain('$css');
  });

  it('reads only what the page already exposes, and names no URL but this app', () => {
    expect(script).toContain('window.initialResult');
    expect(script).toContain('localStorage.PeriodStart');
    // No credentials, no tokens, no third party.
    expect(script.match(/https?:\/\/[^'"]+/g)).toEqual([`${ORIGIN}/import/aims`]);
  });

  it('delivers both ways, so one script serves a bookmark and a Shortcut alike', () => {
    // A Shortcut refuses to run without the callback; navigating means it needs no Open URLs
    // action, which Shortcuts will not accept a variable into without complaining.
    expect(script).toContain('location.href = u');
    expect(script).toContain('completion(u)');
    // The callback is guarded, because a Safari bookmark has nothing to hand back to.
    expect(script).toContain("typeof completion === 'function'");
  });

  it('survives having no completion to call, as in a bookmark', () => {
    // jsdom refuses the navigation, which is the point: the throw must not escape.
    expect(() => new Function(`return ${script}`)()).not.toThrow();
  });

  it('folds into a bookmarklet Safari will accept', () => {
    const folded = aimsBookmarklet(ORIGIN);
    expect(folded.startsWith('javascript:')).toBe(true);
    expect(folded).not.toMatch(/\n/);
    expect(decodeURIComponent(folded.slice('javascript:'.length))).toContain('initialResult');
  });
});
