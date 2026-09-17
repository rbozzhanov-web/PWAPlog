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
            Shortcuts → new shortcut → add <em>Run JavaScript on Web Page</em> → paste the script
            below → in its settings turn on <em>Show in Share Sheet</em> and accept web pages. Then
            from AIMS: Share → your shortcut.
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
        <textarea readOnly rows={12} spellCheck={false} value={aimsHandoffScript(origin)} aria-label="Handoff script source" />
      </details>
    </section>
  );
}
