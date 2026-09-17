import { buildAimsRoster, type AimsRoster, type RecordValue } from './aims';

/**
 * Handing a roster straight from the AIMS page to this app.
 *
 * The saved-Web-Archive route works but costs eight steps on a phone — share, options, web
 * archive, save to files, open eScrew, roster, add AIMS, pick the file. Everything that route digs
 * out of the saved HTML is a plain global on the live Crew Schedule page, so a script running
 * there can read it and hand it over in one tap.
 *
 * The payload travels in the URL *fragment*, which browsers never send to the server: the roster
 * goes from the pilot's AIMS session to their own device without touching Cloudflare's logs, which
 * is the same promise the file import makes. Gzipped and base64url-encoded it is around 9 KB for a
 * month, against 97 KB raw — comfortably inside what Safari will navigate to, where the raw form
 * is not.
 */

export const HANDOFF_VERSION = 1;
export const HANDOFF_PATH = '/import/aims';

export interface AimsHandoff {
  v: number;
  result: RecordValue;
  events?: unknown[];
  periodStart?: string;
  periodEnd?: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** A one-chunk stream. Built directly rather than via Blob, which jsdom ships without `stream()`. */
function streamOf(bytes: Uint8Array): ReadableStream<BufferSource> {
  return new ReadableStream<BufferSource>({
    start(controller) { controller.enqueue(bytes as BufferSource); controller.close(); },
  });
}

async function through(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { merged.set(chunk, at); at += chunk.length; }
  return merged;
}

/** Only used by the tests and the bookmarklet builder — the real encoding happens on the AIMS page. */
export async function encodeHandoff(handoff: AimsHandoff): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(handoff));
  return toBase64Url(await through(streamOf(json).pipeThrough(new CompressionStream('gzip'))));
}

export async function decodeHandoff(encoded: string, compressed = true): Promise<AimsHandoff> {
  let text: string;
  try {
    const bytes = fromBase64Url(encoded);
    text = compressed
      ? new TextDecoder().decode(await through(streamOf(bytes).pipeThrough(new DecompressionStream('gzip'))))
      : new TextDecoder().decode(bytes);
  } catch {
    throw new Error('This roster link is damaged. Run the shortcut again from the AIMS page.');
  }
  const handoff: unknown = JSON.parse(text);
  if (!handoff || typeof handoff !== 'object') throw new Error('This roster link carried nothing readable.');
  const typed = handoff as AimsHandoff;
  // A newer shortcut against an older app: say so plainly rather than failing somewhere deeper.
  if (typed.v !== HANDOFF_VERSION) throw new Error('This roster link was made by a different version of the shortcut. Reinstall it from Settings.');
  if (!typed.result || typeof typed.result !== 'object') throw new Error('The AIMS page handed over no schedule. Load your roster fully before running the shortcut.');
  return typed;
}

export async function rosterFromHandoff(encoded: string, compressed = true): Promise<AimsRoster> {
  const { result, events, periodStart, periodEnd } = await decodeHandoff(encoded, compressed);
  return buildAimsRoster({ result, events, periodStart, periodEnd });
}

/**
 * Reads whatever the shortcut left on the clipboard — the whole link, or only its payload.
 *
 * This exists because of a wall the navigating route cannot cross. An installed PWA has its own
 * storage on iOS, separate from Safari's, and a link opened from the AIMS page lands in Safari.
 * The roster imports perfectly and into the wrong copy of the app, which looks from the home
 * screen exactly like nothing happening at all. The clipboard is one of the few things both sides
 * share, so the payload crosses on it and the pilot pastes it into the app they actually use.
 */
export async function rosterFromHandoffText(text: string): Promise<AimsRoster> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Nothing was pasted. Run the shortcut on your AIMS schedule first, then come back.');
  // The script reports its own failures in the link rather than losing them.
  const reported = /[#&]e=([^&\s]+)/.exec(trimmed);
  if (reported) throw new Error(decodeURIComponent(reported[1]));
  const payload = /[#&](r|j)=([A-Za-z0-9_-]+)/.exec(trimmed);
  if (payload) return rosterFromHandoff(payload[2], payload[1] === 'r');
  if (/^[A-Za-z0-9_-]{64,}$/.test(trimmed)) return rosterFromHandoff(trimmed, false);
  throw new Error('That is not a roster link. Copy what the shortcut produced, without changing it.');
}

/**
 * The script the pilot runs on the AIMS Crew Schedule page.
 *
 * Entirely synchronous, which is the whole design. Shortcuts' "Run JavaScript on Web Page" does
 * not wait for asynchronous work: an earlier version gzipped the payload in a promise, and the
 * action finished before the callback ever ran — reporting only "a valid URL is required", with an
 * empty result, and later doing nothing at all when the script tried to navigate from inside that
 * same callback. Both symptoms were one cause. Nothing here returns a promise, so there is no turn
 * of the event loop to be cut off at.
 *
 * That rules out CompressionStream, so the schedule goes as plain base64url — around 54 KB of URL
 * rather than 9 KB. Long, but it arrives, and it is what the payload is pruned for below: the
 * elements the roster parser never reads are dropped, along with the per-row styling AIMS ships
 * with the crew list.
 *
 * It delivers both ways at once — it navigates *and* it calls `completion` — so one script serves
 * a Safari bookmark and a Shortcut alike, and so that either mechanism failing still leaves the
 * other. Setting `location.href` only schedules the navigation, so the callback still fires first,
 * and the call is guarded because a bookmark has nothing to hand back to.
 */
export function aimsHandoffScript(appOrigin: string): string {
  return `(function () {
  var app = '${appOrigin}${HANDOFF_PATH}';
  var sent = false;
  function done(u) {
    if (sent) return;
    sent = true;
    try { if (typeof completion === 'function') completion(u); } catch (e) {}
    try { location.href = u; } catch (e) {}
  }
  function fail(m) { done(app + '#e=' + encodeURIComponent(String(m && m.message ? m.message : m).slice(0, 300))); }
  function lean(v) {
    if (Array.isArray(v)) return v.map(lean);
    if (v && typeof v === 'object') {
      var o = {};
      for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k) && k !== '$css' && k !== 'css') o[k] = lean(v[k]);
      return o;
    }
    return v;
  }
  try {
    var r = window.initialResult;
    if (!r) return fail('Open your AIMS Crew Schedule and let it finish loading, then run this again.');
    var keep = [];
    var list = r.elementList || [];
    for (var i = 0; i < list.length; i++) if (['totals', 'hours', 'members', 'hotels'].indexOf(list[i] && list[i].id) >= 0) keep.push(list[i]);
    var payload = {
      v: ${HANDOFF_VERSION},
      result: lean({ SchedulerEvents: r.SchedulerEvents, elementList: keep }),
      events: window.Events,
      periodStart: localStorage.PeriodStart,
      periodEnd: localStorage.PeriodEnd,
    };
    var bytes = new TextEncoder().encode(JSON.stringify(payload));
    var bin = '';
    for (var j = 0; j < bytes.length; j += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 8192));
    done(app + '#j=' + btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''));
  } catch (e) { fail(e); }
})()`;
}

/** The same script folded into a `javascript:` URL for use as a Safari bookmark. */
export function aimsBookmarklet(appOrigin: string): string {
  return `javascript:${encodeURIComponent(aimsHandoffScript(appOrigin).replace(/\s*\n\s*/g, ' '))}`;
}
