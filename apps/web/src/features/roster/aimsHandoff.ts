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
 * The script the pilot runs on the AIMS Crew Schedule page.
 *
 * Written defensively rather than tidily, because of where it has to survive. Shortcuts' "Run
 * JavaScript on Web Page" reports one thing when anything at all goes wrong — "a valid URL is
 * required" — and shows nothing about why, so a script that throws, hangs, or misses its callback
 * leaves the pilot with no way to tell which. Three rules follow from that:
 *
 *  - `completion` is called exactly once, on every path, always with a URL this app can open. A
 *    failure becomes `#e=<reason>`, which the import page renders, so the reason reaches a screen
 *    rather than dying in a context nobody can inspect.
 *  - A watchdog fires if nothing else has, so the action can never simply hang.
 *  - No async function wraps the whole thing and no `await` is used. The work is asynchronous, but
 *    keeping the outer scope plain means an unhandled rejection cannot swallow the callback.
 *
 * It also delivers both ways at once — it navigates *and* it calls `completion` — which is what
 * lets one script serve a Safari bookmark and a Shortcut alike. The Shortcut needs the callback or
 * it refuses to run at all; navigating means it does not also need an "Open URLs" action, and
 * Shortcuts will not pass a variable into one of those without complaining that it wants a literal
 * URL. Setting `location.href` only schedules the navigation, so the callback still fires first.
 *
 * Compression is what makes the link short enough to open at all — 9 KB against 67 KB. When it is
 * unavailable the script falls back to sending the schedule uncompressed rather than failing: a
 * long URL that works beats a clean error.
 */
export function aimsHandoffScript(appOrigin: string): string {
  return `(function () {
  var app = '${appOrigin}${HANDOFF_PATH}';
  var sent = false;
  function done(u) {
    if (sent) return;
    sent = true;
    try { location.href = u; } catch (e) {}
    try { if (typeof completion === 'function') completion(u); } catch (e) {}
  }
  function fail(m) { done(app + '#e=' + encodeURIComponent(String(m && m.message ? m.message : m).slice(0, 300))); }
  function b64url(bin) { return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); }
  function binary(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return s; }
  setTimeout(function () { fail('Timed out reading the roster. Let the AIMS page finish loading, then run this again.'); }, 10000);
  try {
    if (!window.initialResult) return fail('Open your AIMS Crew Schedule and let it finish loading, then run this again.');
    var payload = {
      v: ${HANDOFF_VERSION},
      result: window.initialResult,
      events: window.Events,
      periodStart: localStorage.PeriodStart,
      periodEnd: localStorage.PeriodEnd,
    };
    var json = JSON.stringify(payload);
    var bytes = new TextEncoder().encode(json);
    var plain = function () { return app + '#j=' + b64url(binary(bytes)); };
    if (typeof CompressionStream === 'undefined' || typeof ReadableStream === 'undefined') return done(plain());
    var src = new ReadableStream({ start: function (c) { c.enqueue(bytes); c.close(); } });
    new Response(src.pipeThrough(new CompressionStream('gzip'))).arrayBuffer().then(function (ab) {
      done(app + '#r=' + b64url(binary(new Uint8Array(ab))));
    }).catch(function () { done(plain()); });
  } catch (e) { fail(e); }
})()`;
}

/** The same script folded into a `javascript:` URL for use as a Safari bookmark. */
export function aimsBookmarklet(appOrigin: string): string {
  return `javascript:${encodeURIComponent(aimsHandoffScript(appOrigin).replace(/\s*\n\s*/g, ' '))}`;
}
