/// <reference types="vitest/globals" />

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FlightLogEntry } from '@pilot-logbook/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../../../app/routes';
import type { PilotLogbookDb } from '../../../db/database';
import { createPilotLogbookDb } from '../../../db/database';
import {
  createFlightEntry,
  getFlightEntry,
  listFlightEntries,
} from '../../../db/repositories/flightEntries';

const stylesheet = readFileSync(
  resolve(process.cwd(), 'apps/web/src/styles/global.css'),
  'utf8',
);

function entry(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'entry-1',
    date: '2026-09-08',
    departureAirport: 'UAAA',
    arrivalAirport: 'UACC',
    totalTimeMinutes: 90,
    picMinutes: 0,
    sicMinutes: 90,
    dualReceivedMinutes: 0,
    dualGivenMinutes: 0,
    soloMinutes: 0,
    dayMinutes: 90,
    nightMinutes: 0,
    actualInstrumentMinutes: 0,
    simulatedInstrumentMinutes: 0,
    crossCountryMinutes: 0,
    simulatorMinutes: 0,
    dayTakeoffs: 1,
    nightTakeoffs: 0,
    dayLandings: 1,
    nightLandings: 0,
    instrumentApproaches: 0,
    source: 'manual',
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('EntryEditorPage', () => {
  let db: PilotLogbookDb | undefined;

  afterEach(async () => {
    await db?.delete();
  });

  test('keeps route fields in one column until the desktop breakpoint', () => {
    const style = document.createElement('style');
    style.textContent = stylesheet;
    document.head.append(style);
    const mobileRouteRule = Array.from(style.sheet?.cssRules ?? []).find(
      (rule) => rule instanceof CSSStyleRule && rule.selectorText === '.entry-form__route',
    ) as CSSStyleRule | undefined;
    expect(mobileRouteRule?.style.getPropertyValue('grid-template-columns')).toBe(
      'minmax(0, 1fr)',
    );

    const mediaRule = Array.from(style.sheet?.cssRules ?? []).find(
      (rule) => rule instanceof CSSMediaRule && rule.conditionText === '(min-width: 38rem)',
    ) as CSSMediaRule | undefined;
    const desktopRouteRule = Array.from(mediaRule?.cssRules ?? []).find(
      (rule) =>
        rule instanceof CSSStyleRule &&
        rule.selectorText
          .split(',')
          .map((selector) => selector.trim())
          .includes('.entry-form__route'),
    ) as CSSStyleRule | undefined;
    expect(desktopRouteRule?.style.getPropertyValue('grid-template-columns')).toBe(
      'repeat(2, minmax(0, 1fr))',
    );

    style.remove();
  });

  test('blocks an empty route and saves a valid manual flight', async () => {
    db = createPilotLogbookDb('manual-entry-editor-create-test');

    render(
      <MemoryRouter initialEntries={['/logbook/new']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Save flight' }));
    expect(await screen.findByText('Departure is required')).toBeVisible();

    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: 'UAAA' } });
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: 'UACC' } });
    fireEvent.change(screen.getByLabelText('Total minutes'), { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save flight' }));

    expect(
      await within(await screen.findByRole('region', { name: 'Logbook summary' })).findByText(
        '1h 35m',
      ),
    ).toBeVisible();
    await waitFor(async () => {
      await expect(listFlightEntries(db!)).resolves.toMatchObject([
        {
          departureAirport: 'UAAA',
          arrivalAirport: 'UACC',
          totalTimeMinutes: 95,
          source: 'manual',
        },
      ]);
    });
  });

  test('rejects negative time without mutating the logbook', async () => {
    db = createPilotLogbookDb('manual-entry-editor-validation-test');

    render(
      <MemoryRouter initialEntries={['/logbook/new']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Departure'), { target: { value: 'UAAA' } });
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: 'UACC' } });
    fireEvent.change(screen.getByLabelText('Night minutes'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save flight' }));

    expect(await screen.findByText('Night minutes must be zero or greater')).toBeVisible();
    await expect(listFlightEntries(db)).resolves.toEqual([]);
  });

  test.each([
    ['Total minutes', 'totalTimeMinutes'],
    ['Day landings', 'dayLandings'],
  ] as const)('rejects fractional %s without mutating the logbook', async (label, field) => {
    db = createPilotLogbookDb(`manual-entry-editor-${field}-integer-test`);

    render(
      <MemoryRouter initialEntries={['/logbook/new']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText('Departure'), { target: { value: 'UAAA' } });
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: 'UACC' } });
    fireEvent.change(screen.getByLabelText(label), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save flight' }));

    expect(await screen.findByText(`${label} must be a whole number`)).toBeVisible();
    await expect(listFlightEntries(db)).resolves.toEqual([]);
  });

  test('loads and updates an entry while preserving its identity and creation time', async () => {
    db = createPilotLogbookDb('manual-entry-editor-update-test');
    const original = entry();
    await createFlightEntry(db, original);

    render(
      <MemoryRouter initialEntries={['/logbook/entry-1']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('UAAA')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Remarks'), { target: { value: 'Training sector' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save flight' }));

    expect(
      await within(await screen.findByRole('region', { name: 'Logbook summary' })).findByText(
        '1h 30m',
      ),
    ).toBeVisible();
    await expect(getFlightEntry(db, 'entry-1')).resolves.toMatchObject({
      id: 'entry-1',
      createdAt: original.createdAt,
      remarks: 'Training sector',
    });
    expect((await getFlightEntry(db, 'entry-1'))?.updatedAt).not.toBe(original.updatedAt);
  });

  test('requires explicit confirmation before deleting the selected entry', async () => {
    db = createPilotLogbookDb('manual-entry-editor-delete-test');
    await createFlightEntry(db, entry());

    render(
      <MemoryRouter initialEntries={['/logbook/entry-1']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Delete flight' }));
    expect(screen.getByRole('heading', { name: 'Delete this flight?' })).toBeVisible();
    await expect(getFlightEntry(db, 'entry-1')).resolves.toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Delete flight permanently' }));

    expect(await screen.findByRole('heading', { name: 'No flights yet' })).toBeVisible();
    await expect(getFlightEntry(db, 'entry-1')).resolves.toBeUndefined();
  });
});
