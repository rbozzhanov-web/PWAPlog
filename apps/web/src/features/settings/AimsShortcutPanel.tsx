import { useState } from 'react';

import { aimsBookmarklet, aimsHandoffScript } from '../roster/aimsHandoff';

/**
 * Installing the one-tap roster handoff.
 *
 * The script has to be built here rather than written down, because it has to point at whatever
 * origin this copy of the app is served from — a preview deployment, localhost, or the real thing.
 */
export function AimsShortcutPanel() {
  const origin = window.location.origin;
  const [copied, setCopied] = useState<'script' | 'bookmarklet'>();

  const copy = async (what: 'script' | 'bookmarklet') => {
    const text = what === 'script' ? aimsHandoffScript(origin) : aimsBookmarklet(origin);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      window.setTimeout(() => setCopied(undefined), 2200);
    } catch {
      // Clipboard access can be refused; the textarea below is always there to copy from by hand.
      setCopied(undefined);
    }
  };

  return (
    <section className="settings-card settings-aims" aria-labelledby="aims-shortcut-heading">
      <div className="settings-card__body">
        <p className="settings-eyebrow">Roster</p>
        <h2 id="aims-shortcut-heading">One-tap import from AIMS</h2>
        <p>
          Saving a Web Archive takes eight steps. This does it in one, from the AIMS page you are
          already logged into. It reads the same schedule the Web Archive contains and sends it
          only to this app — no password is stored anywhere, and the roster travels in the part of
          the link browsers never send to a server.
        </p>
      </div>

      <ol className="settings-steps">
        <li>
          <strong>On iPhone — a Shortcut</strong>
          <span>
            One action is all it needs: <em>Run JavaScript on Web Page</em>, with the script below
            pasted into it. The script opens eScrew itself, so there is nothing to wire up
            afterwards — and no <em>Open URLs</em> action to argue with about whether a variable
            counts as a URL.
          </span>
          <span>
            Then in the shortcut's settings turn on <em>Show in Share Sheet</em> and let it accept
            web pages. From AIMS: Share → your shortcut.
          </span>
          <span>
            If the page does not move on its own, add two more actions after it: <em>URL</em>
            holding the <em>JavaScript Result</em>, then <em>Open URLs</em> holding that{' '}
            <em>URL</em>. Shortcuts may still show a warning next to <em>Open URLs</em> about
            needing a valid URL — that is it failing to guess what the variable holds, and it runs
            anyway.
          </span>
          <button onClick={() => void copy('script')} type="button">
            {copied === 'script' ? 'Copied' : 'Copy the script'}
          </button>
        </li>
        <li>
          <strong>Or a Safari bookmark</strong>
          <span>
            Bookmark any page, then edit the bookmark and replace its address with this. Open it
            from the address bar while you are on your AIMS schedule.
          </span>
          <button onClick={() => void copy('bookmarklet')} type="button">
            {copied === 'bookmarklet' ? 'Copied' : 'Copy the bookmark address'}
          </button>
        </li>
      </ol>

      <details className="settings-disclosure">
        <summary>See exactly what it runs</summary>
        <textarea readOnly rows={14} spellCheck={false} value={aimsHandoffScript(origin)} aria-label="Handoff script source" />
      </details>
    </section>
  );
}
