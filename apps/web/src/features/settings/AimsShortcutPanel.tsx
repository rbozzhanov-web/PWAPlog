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
            Two actions. The second is what gets the roster past a wall iOS puts up: an app added
            to your home screen keeps its own data, separate from Safari's, so a link opened from
            the AIMS page imports into Safari's copy of eScrew and the one on your home screen
            never sees it. The clipboard is shared, so the roster travels on that instead.
          </span>
          <ol className="settings-substeps">
            <li><em>Run JavaScript on Web Page</em> — paste the script below into it.</li>
            <li><em>Copy to Clipboard</em> — give it the <em>JavaScript Result</em>.</li>
          </ol>
          <span>
            That is the whole shortcut — there is no action to reopen this app, because a home
            screen web app is not something Shortcuts can open. Then in its settings turn on{' '}
            <em>Show in Share Sheet</em> and accept Safari web pages.
          </span>
          <span>
            To use it: on your AIMS schedule, Share → your shortcut, then switch back here and
            press <em>Paste</em> on the Roster tab.
          </span>
          <span>
            If you use eScrew in Safari rather than from the home screen, there is no wall and no
            second action is needed — the script opens the app itself.
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
