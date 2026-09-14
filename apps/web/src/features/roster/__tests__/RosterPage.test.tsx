/// <reference types="vitest/globals" />

import { fireEvent, render, screen } from '@testing-library/react';
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
});
