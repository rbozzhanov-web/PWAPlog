/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../App';

test('renders the logbook shell without a network request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  render(
    <MemoryRouter initialEntries={['/logbook']}>
      <App />
    </MemoryRouter>,
  );

  expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
  expect(fetchSpy).not.toHaveBeenCalled();
});
