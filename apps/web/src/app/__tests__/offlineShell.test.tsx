/// <reference types="vitest/globals" />

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { App } from '../App';

test('opens the Home shell without a network request on a fresh launch', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');

  render(
    <MemoryRouter initialEntries={['/logbook']}>
      <App />
    </MemoryRouter>,
  );

  await waitFor(() => expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page'));
  expect(fetchSpy).not.toHaveBeenCalled();
});
