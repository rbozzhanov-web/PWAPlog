/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

test('redirects an unknown location to the logbook shell', async () => {
  render(<MemoryRouter initialEntries={['/unknown']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
});

test('opens backup onboarding from the settings route', async () => {
  render(<MemoryRouter initialEntries={['/settings']}><App /></MemoryRouter>);

  expect(
    await screen.findByRole('heading', { name: 'Import existing PilotLogbook backup' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Export logbook backup' })).toBeVisible();
  expect(screen.getByText(/local to this browser and device/i)).toBeVisible();
});
