/// <reference types="vitest/globals" />

const { extractPdfText } = vi.hoisted(() => ({
  extractPdfText: vi.fn(),
}));

vi.mock('../../../platform/pdf/extractText', () => ({
  extractPdfText,
}));

import type { ExtractedPage } from '@pilot-logbook/core';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../../../app/routes';
import type { PilotLogbookDb } from '../../../db/database';
import { createPilotLogbookDb } from '../../../db/database';

function pdfFile(name = 'flight-time-report.pdf'): File {
  return new File(['%PDF-1.7'], name, { type: 'application/pdf' });
}

function pageWithLine(tokens: string[]): ExtractedPage[] {
  return [
    {
      width: 612,
      height: 792,
      items: tokens.map((str, index) => ({
        str,
        x: 40 + index * 80,
        y: 100,
        width: 60,
      })),
    },
  ];
}

async function choosePdf(file = pdfFile()) {
  const input = await screen.findByLabelText('Choose PDF file');
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
}

describe('logbook PDF import routes', () => {
  let db: PilotLogbookDb | undefined;

  beforeEach(() => {
    extractPdfText.mockReset();
  });

  afterEach(async () => {
    await db?.delete();
  });

  test('opens a selected PDF in review without writing candidates', async () => {
    db = createPilotLogbookDb('pdf-import-picker-flow-test');
    const file = pdfFile();
    extractPdfText.mockResolvedValue(
      pageWithLine(['11/09/2026', 'UAAA', 'UACC', '08:00', '09:30']),
    );
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    await choosePdf(file);

    expect(await screen.findByRole('heading', { name: 'Review imported flights' })).toBeVisible();
    expect(extractPdfText).toHaveBeenCalledWith(file);
    expect(screen.getByDisplayValue('UAAA')).toBeVisible();
    await expect(db.flightEntries.count()).resolves.toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Discard flight' }));
    expect(screen.getByRole('button', { name: 'Import 0 flights' })).toBeDisabled();
    await expect(db.flightEntries.count()).resolves.toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Restore flight' }));
    expect(screen.getByRole('button', { name: 'Import 1 flight' })).toBeEnabled();
  });

  test('accepts a PDF dropped on the drop zone', async () => {
    db = createPilotLogbookDb('pdf-import-drop-flow-test');
    const file = pdfFile('dropped-report.pdf');
    extractPdfText.mockResolvedValue(
      pageWithLine(['11/09/2026', 'UAAA', 'UACC', '08:00', '09:30']),
    );
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    fireEvent.drop(await screen.findByRole('button', { name: /drop a pdf here/i }), {
      dataTransfer: { files: [file] },
    });

    expect(await screen.findByText('dropped-report.pdf')).toBeVisible();
    expect(extractPdfText).toHaveBeenCalledWith(file);
    await expect(db.flightEntries.count()).resolves.toBe(0);
  });

  test('ignores another dropped report while the selected report is still processing', async () => {
    db = createPilotLogbookDb('pdf-import-concurrent-drop-test');
    const selectedFile = pdfFile('selected-report.pdf');
    const droppedFile = pdfFile('dropped-report.pdf');
    let finishExtraction: ((pages: ExtractedPage[]) => void) | undefined;
    extractPdfText.mockImplementationOnce(
      () => new Promise<ExtractedPage[]>((resolve) => {
        finishExtraction = resolve;
      }),
    );
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    const input = await screen.findByLabelText('Choose PDF file');
    const dropZone = screen.getByRole('button', { name: /drop a pdf here/i });
    fireEvent.change(input, { target: { files: [selectedFile] } });

    expect(await screen.findByRole('status')).toHaveTextContent('Extracting and checking flights');
    expect(input).toBeDisabled();
    fireEvent.drop(dropZone, { dataTransfer: { files: [droppedFile] } });
    expect(extractPdfText).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishExtraction?.(
        pageWithLine(['11/09/2026', 'UAAA', 'UACC', '08:00', '09:30']),
      );
    });

    expect(await screen.findByText('selected-report.pdf')).toBeVisible();
    expect(screen.queryByText('dropped-report.pdf')).not.toBeInTheDocument();
    await expect(db.flightEntries.count()).resolves.toBe(0);
  });

  test('does not open review after the picker is left while extraction is pending', async () => {
    db = createPilotLogbookDb('pdf-import-leave-picker-test');
    let finishExtraction: ((pages: ExtractedPage[]) => void) | undefined;
    extractPdfText.mockImplementationOnce(
      () => new Promise<ExtractedPage[]>((resolve) => {
        finishExtraction = resolve;
      }),
    );
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    await choosePdf();
    fireEvent.click(screen.getByRole('link', { name: /logbook/i }));
    expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'No flights yet' })).toBeVisible();

    await act(async () => {
      finishExtraction?.(
        pageWithLine(['11/09/2026', 'UAAA', 'UACC', '08:00', '09:30']),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.getByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Review imported flights' })).toBeNull();
    await expect(db.flightEntries.count()).resolves.toBe(0);
  });

  test('shows an actionable extraction error and offers another file', async () => {
    db = createPilotLogbookDb('pdf-import-extraction-error-test');
    extractPdfText.mockRejectedValue(new Error('Encrypted PDF'));
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    await choosePdf();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The PDF could not be read. Choose another PDF or export a fresh copy.',
    );
    expect(screen.getByLabelText('Choose PDF file')).toBeEnabled();
    await expect(db.flightEntries.count()).resolves.toBe(0);
  });

  test('keeps an unrecognized report on the picker with a parsing error', async () => {
    db = createPilotLogbookDb('pdf-import-empty-parser-test');
    extractPdfText.mockResolvedValue(pageWithLine(['MONTHLY TOTAL', '00:00']));
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    await choosePdf();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No flight entries were found. Check the report and choose another PDF.',
    );
    expect(screen.getByRole('heading', { name: 'Import logbook PDF' })).toBeVisible();
    await expect(db.flightEntries.count()).resolves.toBe(0);
  });

  test('shows parser warnings, saves edited approved candidates only after confirmation, and returns to the logbook', async () => {
    db = createPilotLogbookDb('pdf-import-review-confirm-test');
    extractPdfText.mockResolvedValue(pageWithLine(['11/09/2026', '08:00', '09:30']));
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    await choosePdf();

    const review = await screen.findByRole('heading', { name: 'Review imported flights' });
    expect(review).toBeVisible();
    expect(screen.getByText('Low confidence')).toBeVisible();
    expect(
      screen.getByText('Departure or arrival airport could not be read from this row.'),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: 'uaaa' } });
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: 'uacc' } });
    fireEvent.change(screen.getByLabelText('Total minutes'), { target: { value: '95' } });
    await expect(db.flightEntries.count()).resolves.toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 flight' }));

    expect(await screen.findByRole('heading', { name: 'Pilot Logbook' })).toBeVisible();
    expect(await screen.findByRole('link', { name: /UAAA to UACC/i })).toBeVisible();
    expect(
      await within(screen.getByRole('region', { name: 'Logbook summary' })).findByText('1h 35m'),
    ).toBeVisible();
    await waitFor(async () => {
      await expect(db!.flightEntries.toArray()).resolves.toMatchObject([
        {
          departureAirport: 'UAAA',
          arrivalAirport: 'UACC',
          totalTimeMinutes: 95,
          source: 'pdf_import',
        },
      ]);
    });
  });

  test('shows field errors and does not persist invalid approved-candidate edits', async () => {
    db = createPilotLogbookDb('pdf-import-review-validation-test');
    extractPdfText.mockResolvedValue(
      pageWithLine(['11/09/2026', 'UAAA', 'UACC', '08:00', '09:30']),
    );
    render(
      <MemoryRouter initialEntries={['/import/logbook']}>
        <AppRoutes db={db} />
      </MemoryRouter>,
    );

    await choosePdf();
    expect(await screen.findByRole('heading', { name: 'Review imported flights' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Total minutes'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('Day landings'), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Import 1 flight' }));

    expect(await screen.findByText('Date is required')).toBeVisible();
    expect(screen.getByText('Departure is required')).toBeVisible();
    expect(screen.getByText('Arrival is required')).toBeVisible();
    expect(screen.getByText('Total minutes must be zero or greater')).toBeVisible();
    expect(screen.getByText('Day landings must be a whole number')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Review imported flights' })).toBeVisible();
    await expect(db.flightEntries.count()).resolves.toBe(0);
  });
});
