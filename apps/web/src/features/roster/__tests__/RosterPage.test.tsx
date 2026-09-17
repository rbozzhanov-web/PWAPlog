/// <reference types="vitest/globals" />

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { RosterPage } from '../RosterPage';
import { saveAimsRoster } from '../aims';

describe('RosterPage AIMS import flow', () => {
  beforeEach(() => localStorage.clear());

  it('opens the eScrew-style Web Archive instructions before choosing a file', () => {
    render(<MemoryRouter><RosterPage /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: 'Add AIMS' }));

    expect(screen.getByRole('dialog', { name: 'Import from AIMS' })).toBeVisible();
    expect(screen.getByText(/Share → Options → Web Archive → Save to Files/i)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open AIMS Crew Schedule' })).toHaveAttribute(
      'href',
      'https://aims.airastana.com/eCrew/CrewSchedule',
    );
    expect(screen.getByLabelText('Choose saved AIMS Web Archive')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Import from AIMS' })).toBeNull();
  });

  it('uses the same flow for replacing a previously imported roster', async () => {
    saveAimsRoster({
      period: { start: '2026-09-01', end: '2026-09-30' },
      duties: [],
      hotels: [],
      absences: [],
      activities: [],
      totals: {},
      importedAt: '2026-09-01T00:00:00.000Z',
    });

    render(<MemoryRouter><RosterPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace AIMS' }));

    expect(screen.getByRole('dialog', { name: 'Import from AIMS' })).toBeVisible();
  });

  // The sector opens in place rather than on a route of its own, so this asserts both halves:
  // the times and crew appear, and the roster is still the page underneath.
  it('reveals a flight\'s times and crew in place, without navigating away', async () => {
    const today = new Date().toISOString().slice(0, 10);
    saveAimsRoster({
      period: { start: today, end: today },
      duties: [{
        date: today,
        report: `${today}T05:10`,
        start: `${today}T05:10`,
        end: `${today}T14:20`,
        flights: [{
          flightNumber: 'KC931', date: today, origin: 'ALA', destination: 'NQZ',
          departure: '06:10', arrival: '08:05', deadhead: false, actualTimes: false,
          aircraftType: 'A321',
          crew: [
            { name: 'Bozzhanov Ramil', role: 'Flight deck', position: 'CPT' },
            { name: 'Verzun Mark', role: 'Flight deck', position: 'FO' },
          ],
        }],
      }],
      hotels: [], absences: [], activities: [], totals: {},
      importedAt: new Date().toISOString(),
    });

    render(<MemoryRouter><RosterPage /></MemoryRouter>);

    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: /KC931/ }));

    const popup = screen.getByRole('dialog', { name: /ALA.*NQZ/ });
    expect(popup).toBeVisible();
    // times
    expect(within(popup).getByText('05:10')).toBeVisible();
    expect(within(popup).getByText('06:10')).toBeVisible();
    expect(within(popup).getByText('08:05')).toBeVisible();
    expect(within(popup).getByText('14:20')).toBeVisible();
    // crew
    expect(within(popup).getByText('Bozzhanov Ramil')).toBeVisible();
    expect(within(popup).getByText('Verzun Mark')).toBeVisible();
    // the roster is still the page behind it
    expect(screen.getByRole('heading', { name: 'Roster' })).toBeVisible();

    // Dismissed by dragging the sheet down from its handle.
    const handle = within(popup).getByRole('button', { name: 'Close' });
    const grab = handle.parentElement!;
    fireEvent.pointerDown(grab, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grab, { clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 260, pointerId: 1 });

    // The sheet animates out rather than vanishing, so it is still mounted on this tick — and it
    // has already committed to leaving.
    expect(popup).toHaveClass('is-closing');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });
  });

  // A short pull is a mis-swipe, not a dismissal: the sheet has to come back.
  it('springs back when the swipe stops short of the threshold', async () => {
    const today = new Date().toISOString().slice(0, 10);
    saveAimsRoster({
      period: { start: today, end: today },
      duties: [{
        date: today, report: `${today}T05:10`, start: `${today}T05:10`, end: `${today}T14:20`,
        flights: [{
          flightNumber: 'KC931', date: today, origin: 'ALA', destination: 'NQZ',
          departure: '06:10', arrival: '08:05', deadhead: false, actualTimes: false,
        }],
      }],
      hotels: [], absences: [], activities: [], totals: {}, importedAt: new Date().toISOString(),
    });

    render(<MemoryRouter><RosterPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /KC931/ }));

    const popup = screen.getByRole('dialog', { name: /ALA.*NQZ/ });
    const grab = within(popup).getByRole('button', { name: 'Close' }).parentElement!;
    fireEvent.pointerDown(grab, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(grab, { clientY: 140, pointerId: 1 });
    fireEvent.pointerUp(grab, { clientY: 140, pointerId: 1 });

    expect(screen.getByRole('dialog', { name: /ALA.*NQZ/ })).toBeVisible();
    expect(popup).not.toHaveClass('is-closing');
    expect(popup.style.transform).toBe('');
  });

  // The handle is the keyboard and assistive route out, since the gesture is not one.
  it('closes from the handle without a gesture', async () => {
    const today = new Date().toISOString().slice(0, 10);
    saveAimsRoster({
      period: { start: today, end: today },
      duties: [{
        date: today, report: `${today}T05:10`, start: `${today}T05:10`, end: `${today}T14:20`,
        flights: [{
          flightNumber: 'KC931', date: today, origin: 'ALA', destination: 'NQZ',
          departure: '06:10', arrival: '08:05', deadhead: false, actualTimes: false,
        }],
      }],
      hotels: [], absences: [], activities: [], totals: {}, importedAt: new Date().toISOString(),
    });

    render(<MemoryRouter><RosterPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /KC931/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 2000 });
  });

  it('shows flights and every roster activity in one list, highlights OFF, DOFF and today, and focuses today', async () => {
    const dateKey = (offset: number) => {
      const value = new Date();
      value.setDate(value.getDate() + offset);
      return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    };
    const offDate = dateKey(-1);
    const today = dateKey(0);
    const doffDate = dateKey(1);
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    saveAimsRoster({
      period: { start: offDate, end: doffDate },
      duties: [{
        date: today,
        start: `${today}T08:00`,
        end: `${today}T12:00`,
        flights: [{ flightNumber: 'KC951', date: today, origin: 'ALA', destination: 'NQZ', departure: '09:00', arrival: '10:40', deadhead: false, actualTimes: false }],
      }],
      activities: [
        { date: offDate, code: 'OFF', title: 'Day Off', type: 'Off' },
        { date: today, code: 'AVLB', title: 'Available', type: 'Standby' },
        { date: doffDate, code: 'DOFF', title: 'Day Off Downroute', type: 'Off' },
      ],
      hotels: [],
      absences: [],
      totals: {},
      importedAt: new Date().toISOString(),
    });

    const { container } = render(<MemoryRouter><RosterPage /></MemoryRouter>);

    expect(screen.queryByRole('tab', { name: 'calendar' })).toBeNull();
    expect(screen.getByText('KC951')).toBeVisible();
    expect(screen.getByText('OFF')).toBeVisible();
    expect(screen.getByText('AVLB')).toBeVisible();
    expect(screen.getByText('DOFF')).toBeVisible();
    expect(container.querySelector(`[data-date="${offDate}"]`)).toHaveClass('roster-timeline__day--off');
    expect(container.querySelector(`[data-date="${doffDate}"]`)).toHaveClass('roster-timeline__day--doff');
    expect(container.querySelector(`[data-date="${today}"]`)).toHaveClass('roster-timeline__day--today');
    // Every card on today's date carries the marker, so a day with both a flight and an
    // activity renders it more than once. Assert the day is marked, not how many cards say so.
    expect(screen.getAllByText('TODAY').length).toBeGreaterThan(0);
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', inline: 'nearest', behavior: 'smooth' }));

    vi.unstubAllGlobals();
  });
});

/**
 * The route that gets a roster into an installed PWA. Safari and a home-screen app keep separate
 * storage on iOS, so the shortcut's link cannot carry it across — the clipboard has to.
 */
describe('pasting a roster from the AIMS shortcut', () => {
  let payload: string;

  beforeEach(async () => {
    localStorage.clear();
    const { encodeHandoff } = await import('../aimsHandoff');
    const gz = await encodeHandoff({
      v: 1,
      result: { SchedulerEvents: [{ start: '2026-09-04T10:40:00', end: '2026-09-04T17:24:00', report: '10:40', debrief: '17:24', type: 'Flight', IsDeadhead: false, details: '921  - NQZ  (A1217) - FRA  (A1654)' }] },
      periodStart: '2026-09-01',
      periodEnd: '2026-09-30',
    });
    payload = gz;
  });

  async function openPasteBox() {
    render(<MemoryRouter><RosterPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add AIMS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste roster from AIMS' }));
    return screen.findByLabelText('Paste the roster link from AIMS');
  }

  it('imports straight from the clipboard when iOS allows the read', async () => {
    Object.assign(navigator, { clipboard: { readText: async () => `https://pwaplog.pages.dev/import/aims#r=${payload}` } });

    render(<MemoryRouter><RosterPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add AIMS' }));
    fireEvent.click(screen.getByRole('button', { name: 'Paste roster from AIMS' }));

    expect(await screen.findByRole('button', { name: 'Replace AIMS' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('pwaplog.aims-roster.v1')!).duties[0].flights[0].flightNumber).toBe('KC921');
  });

  it('offers a box to paste into when the clipboard read is refused', async () => {
    // iOS asks before letting a page read the clipboard, so a refusal is ordinary, not exceptional.
    Object.assign(navigator, { clipboard: { readText: async () => { throw new Error('NotAllowedError'); } } });

    const box = await openPasteBox();
    fireEvent.change(box, { target: { value: `https://pwaplog.pages.dev/import/aims#r=${payload}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Import it' }));

    expect(await screen.findByRole('button', { name: 'Replace AIMS' })).toBeVisible();
    expect(JSON.parse(localStorage.getItem('pwaplog.aims-roster.v1')!).duties[0].flights[0].flightNumber).toBe('KC921');
  });

  /**
   * Both roster actions live in the app's fixed header, which is layered above this page's own —
   * a button rendered here would be behind it and untappable. The header dispatches instead.
   */
  it('imports when the app header asks it to, without the sheet being open', async () => {
    Object.assign(navigator, { clipboard: { readText: async () => `https://pwaplog.pages.dev/import/aims#r=${payload}` } });
    render(<MemoryRouter><RosterPage /></MemoryRouter>);

    await act(async () => { window.dispatchEvent(new Event('paste-aims-roster')); });

    await waitFor(() => expect(JSON.parse(localStorage.getItem('pwaplog.aims-roster.v1')!).duties[0].flights[0].flightNumber).toBe('KC921'));
  });

  it('opens the box under the header when the clipboard read is refused', async () => {
    Object.assign(navigator, { clipboard: { readText: async () => { throw new Error('NotAllowedError'); } } });
    render(<MemoryRouter><RosterPage /></MemoryRouter>);

    await act(async () => { window.dispatchEvent(new Event('paste-aims-roster')); });

    expect(await screen.findByLabelText('Paste the roster link from AIMS')).toBeVisible();
  });

  it('shows the reason the shortcut gave rather than a parse failure', async () => {
    Object.assign(navigator, { clipboard: { readText: async () => '' } });

    const box = await openPasteBox();
    fireEvent.change(box, { target: { value: `https://pwaplog.pages.dev/import/aims#e=${encodeURIComponent('Let the AIMS page finish loading.')}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Import it' }));

    expect(await screen.findByText('Let the AIMS page finish loading.')).toBeVisible();
  });
});
