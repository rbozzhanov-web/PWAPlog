/// <reference types="vitest/globals" />

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../App';

test('renders the app shell without a network request', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>,
  );

  // The claim under test is that the shell paints offline, so assert the shell itself — the
  // chrome every route is drawn inside — rather than one route's heading.
  expect(await screen.findByRole('navigation', { name: 'Primary navigation' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open flight records' })).toBeVisible();
  expect(fetchSpy).not.toHaveBeenCalled();
});
