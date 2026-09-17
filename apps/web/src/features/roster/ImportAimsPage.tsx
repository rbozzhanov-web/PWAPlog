import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { saveAimsRoster } from './aims';
import { rosterFromHandoff } from './aimsHandoff';

type State =
  | { status: 'reading' }
  | { status: 'done'; period: { start: string; end: string }; duties: number; sectors: number }
  | { status: 'failed'; message: string };

/**
 * Where the AIMS page hands a roster over.
 *
 * The payload arrives in the fragment, so it is already on the device by the time this runs — the
 * only thing left is to decode it, save it, and get out of the way. The fragment is cleared once
 * read: a roster is the pilot's own business and does not belong in Safari's history or in
 * whatever they paste a URL into next.
 */
export function ImportAimsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ status: 'reading' });
  // Strict mode mounts effects twice in development; the fragment is consumed once either way.
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const encoded = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('r');
    window.history.replaceState(null, '', window.location.pathname);
    if (!encoded) {
      setState({ status: 'failed', message: 'This link carried no roster. Run the shortcut from your AIMS Crew Schedule page.' });
      return;
    }
    let live = true;
    void rosterFromHandoff(encoded).then(
      (roster) => {
        if (!live) return;
        saveAimsRoster(roster);
        window.dispatchEvent(new Event('aims-roster-updated'));
        setState({
          status: 'done',
          period: roster.period,
          duties: roster.duties.length,
          sectors: roster.duties.reduce((total, duty) => total + duty.flights.length, 0),
        });
      },
      (reason: unknown) => {
        if (!live) return;
        setState({ status: 'failed', message: reason instanceof Error ? reason.message : 'Could not read this roster.' });
      },
    );
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (state.status !== 'done') return undefined;
    const timer = window.setTimeout(() => navigate('/roster', { replace: true }), 1400);
    return () => window.clearTimeout(timer);
  }, [state.status, navigate]);

  return (
    <main className="import-aims-page">
      <header className="suite-page-header">
        <div className="tab-header__identity"><p>FROM AIMS</p><h1>Roster handoff</h1></div>
      </header>
      <section className="roster-empty-card" aria-live="polite">
        {state.status === 'reading' ? <>
          <span aria-hidden="true">⤓</span>
          <h2>Reading your roster…</h2>
          <p>This stays on your device — the roster travels in the part of the link browsers never send to a server.</p>
        </> : null}
        {state.status === 'done' ? <>
          <span aria-hidden="true">✓</span>
          <h2>{state.period.start} → {state.period.end}</h2>
          <p>{state.duties} {state.duties === 1 ? 'duty' : 'duties'} · {state.sectors} {state.sectors === 1 ? 'sector' : 'sectors'}. Opening your roster…</p>
        </> : null}
        {state.status === 'failed' ? <>
          <span aria-hidden="true">!</span>
          <h2>That didn't come through</h2>
          <p>{state.message}</p>
          <Link to="/roster">Import a saved Web Archive instead</Link>
        </> : null}
      </section>
    </main>
  );
}
