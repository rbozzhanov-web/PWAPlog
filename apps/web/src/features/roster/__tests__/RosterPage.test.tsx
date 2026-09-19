/// <reference types="vitest/globals" />

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.getByLabelText('Choose saved AIMS Web Archive or Crew Schedule PDF')).toBeInTheDocument();

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

  // The whole point of taking two file types: whichever one the pilot has this time is folded
  // into the roster already stored rather than replacing it, so importing next month does not
  // take this month off the screen — and the days the two files share are listed once.
  it('folds a new import into the roster already stored', async () => {
    saveAimsRoster({
      period: { start: '2026-09-01', end: '2026-09-30' },
      coverage: { start: '2026-09-01', end: '2026-09-30' },
      source: 'pdf',
      duties: [{
        date: '2026-09-04', report: '2026-09-04T05:10',
        flights: [{ flightNumber: 'KC855', date: '2026-09-04', origin: 'ALA', destination: 'NQZ', departure: '06:10', arrival: '08:05', deadhead: false, actualTimes: false }],
      }],
      hotels: [], absences: [], activities: [], totals: {},
      importedAt: '2026-09-01T00:00:00.000Z',
    });
    const october = `<script>localStorage['PeriodStart']='2026-10-01';localStorage['PeriodEnd']='2026-10-31';var initialResult={};var Events=[{"start":"2026-10-02T19:10:00","end":"2026-10-03T06:05:00","report":"19:10","debrief":"06:05","type":"Flight","details":"187 - ALA (2040) - CAN (0535\u207a\u00b9)"}];</script>CrewSchedule`;
    const bytes = new TextEncoder().encode(october);

    render(<MemoryRouter><RosterPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Replace AIMS' }));
    fireEvent.change(screen.getByLabelText('Choose saved AIMS Web Archive or Crew Schedule PDF'), {
      target: { files: [{
        name: 'october.webarchive',
        slice: (from: number, to: number) => ({ arrayBuffer: async () => bytes.slice(from, to).buffer }),
        arrayBuffer: async () => bytes.buffer,
      } as unknown as File] },
    });

    await screen.findByText('KC187');
    expect(screen.getByText('KC855')).toBeInTheDocument();
  });

  // The timeline files a duty under the day it flies, so a report from the evening before has to
  // say which evening — "27 OCT ... Report 22:35" otherwise reads as an evening report that day.
  it('marks a report that happens the day before the flying', async () => {
    saveAimsRoster({
      period: { start: '2026-10-01', end: '2026-10-31' },
      duties: [{
        date: '2026-10-27', report: '2026-10-26T22:35', release: '2026-10-27T10:25',
        flights: [{ flightNumber: 'KC909', date: '2026-10-27', origin: 'ALA', destination: 'ICN', departure: '00:05', arrival: '09:55', deadhead: false, actualTimes: false }],
      }],
      hotels: [], absences: [], activities: [], totals: {}, importedAt: '2026-09-19T00:00:00.000Z',
    });

    render(<MemoryRouter><RosterPage isActive /></MemoryRouter>);

    expect(await screen.findByText(/Report 22:35\u207b\u00b9/)).toBeInTheDocument();
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
 * The actual bug report: after opening AIMS in the in-app browser from this sheet, the app came
 * back on Home with the sheet still floating over it — the reset changed tab without telling the
 * sheet, which belongs to this one.
 */
describe('sheets belong to the Roster tab', () => {
  beforeEach(() => localStorage.clear());

  it('closes the import sheet when the tab is no longer the active one', async () => {
    const { rerender } = render(<MemoryRouter><RosterPage isActive /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add AIMS' }));
    expect(screen.getByRole('dialog', { name: 'Import from AIMS' })).toBeVisible();

    rerender(<MemoryRouter><RosterPage isActive={false} /></MemoryRouter>);

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Import from AIMS' })).toBeNull());
  });

  it('keeps it open while a file is still being read', async () => {
    // Closing mid-import would take the progress and the error message with it.
    const { rerender } = render(<MemoryRouter><RosterPage isActive /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Add AIMS' }));
    const never = new Promise<ArrayBuffer>(() => {});
    fireEvent.change(screen.getByLabelText('Choose saved AIMS Web Archive or Crew Schedule PDF'), {
      // The importer sniffs the first bytes to tell a PDF from an archive, then reads the whole
      // file — this one never finishes being read.
      target: { files: [{ name: 'x.webarchive', slice: () => ({ arrayBuffer: async () => new ArrayBuffer(0) }), arrayBuffer: () => never } as unknown as File] },
    });
    await screen.findByText('Reading schedule…');

    rerender(<MemoryRouter><RosterPage isActive={false} /></MemoryRouter>);

    expect(screen.getByRole('dialog', { name: 'Import from AIMS' })).toBeVisible();
  });
});
