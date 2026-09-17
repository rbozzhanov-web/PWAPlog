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

export async function decodeHandoff(encoded: string): Promise<AimsHandoff> {
  let text: string;
  try {
    const bytes = fromBase64Url(encoded);
    text = new TextDecoder().decode(await through(streamOf(bytes).pipeThrough(new DecompressionStream('gzip'))));
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

export async function rosterFromHandoff(encoded: string): Promise<AimsRoster> {
  const { result, events, periodStart, periodEnd } = await decodeHandoff(encoded);
  return buildAimsRoster({ result, events, periodStart, periodEnd });
}

/**
 * The script the pilot runs on the AIMS Crew Schedule page.
 *
 * Kept as source text rather than a real function so it can be shown, copied into a bookmark, or
 * pasted into a Shortcut's "Run JavaScript on Web Page" action. It reads only what the saved
 * archive already exposes, uses the session the pilot is already logged into, and sends nothing
 * anywhere except this app's own origin.
 */
export function aimsHandoffScript(appOrigin: string): string {
  return `(async () => {
  try {
    if (!window.initialResult) { alert('Open your AIMS Crew Schedule and let it finish loading, then run this again.'); return; }
    const payload = {
      v: ${HANDOFF_VERSION},
      result: window.initialResult,
      events: window.Events,
      periodStart: localStorage.PeriodStart,
      periodEnd: localStorage.PeriodEnd,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const src = new ReadableStream({ start(c) { c.enqueue(bytes); c.close(); } });
    const buf = new Uint8Array(await new Response(src.pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    const tag = btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    location.href = '${appOrigin}${HANDOFF_PATH}#r=' + tag;
  } catch (e) {
    alert('Could not read the roster: ' + e.message);
  }
})()`;
}

/** The same script folded into a `javascript:` URL for use as a Safari bookmark. */
export function aimsBookmarklet(appOrigin: string): string {
  return `javascript:${encodeURIComponent(aimsHandoffScript(appOrigin).replace(/\s*\n\s*/g, ' '))}`;
}
