/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from './App';

test('redirects an unknown location to the logbook shell', async () => {
  render(<MemoryRouter initialEntries={['/unknown']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
});
