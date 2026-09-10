import { NEW_ENTRY_DEFAULTS, FlightLogEntry } from '../../logbook/types';
import { annotateDuplicates } from '../dedupe';
import { ParsedCandidate } from '../types';

function makeExisting(overrides: Partial<FlightLogEntry> = {}): FlightLogEntry {
  return {
    id: 'existing-1',
    date: '2026-07-02',
    departureAirport: 'NQZ',
    arrivalAirport: 'FRA',
    aircraftRegistration: 'EI-KEC',
    timeOut: '07:04',
    timeIn: '14:41',
    totalTimeMinutes: 457,
    ...NEW_ENTRY_DEFAULTS,
    source: 'pdf_import',
    createdAt: '2026-07-02T00:00:00.000Z',
    updatedAt: '2026-07-02T00:00:00.000Z',
    ...overrides,
  };
}

function makeCandidate(fields: Partial<FlightLogEntry>): ParsedCandidate {
  return { rawSourceLine: '', confidence: 'high', unmatchedFields: [], fields };
}

describe('annotateDuplicates', () => {
  it('flags a candidate matching an existing entry on date/airports/registration/timeOut', () => {
    const existing = [makeExisting()];
    const candidate = makeCandidate({
      date: '2026-07-02',
      departureAirport: 'NQZ',
      arrivalAirport: 'FRA',
      aircraftRegistration: 'EI-KEC',
      timeOut: '07:04',
    });

    const [annotated] = annotateDuplicates([candidate], existing);
    expect(annotated.isDuplicate).toBe(true);
  });

  it('does not flag a different flight on the same date', () => {
    const existing = [makeExisting()];
    const candidate = makeCandidate({
      date: '2026-07-02',
      departureAirport: 'FRA',
      arrivalAirport: 'NQZ',
      aircraftRegistration: 'EI-KEC',
      timeOut: '16:31',
    });

    const [annotated] = annotateDuplicates([candidate], existing);
    expect(annotated.isDuplicate).toBe(false);
  });

  it('does not flag when the registration differs', () => {
    const existing = [makeExisting()];
    const candidate = makeCandidate({
      date: '2026-07-02',
      departureAirport: 'NQZ',
      arrivalAirport: 'FRA',
      aircraftRegistration: 'EI-KEB',
      timeOut: '07:04',
    });

    const [annotated] = annotateDuplicates([candidate], existing);
    expect(annotated.isDuplicate).toBe(false);
  });

  it('still flags a duplicate when the candidate is missing a registration to compare', () => {
    const existing = [makeExisting()];
    const candidate = makeCandidate({
      date: '2026-07-02',
      departureAirport: 'NQZ',
      arrivalAirport: 'FRA',
      timeOut: '07:04',
    });

    const [annotated] = annotateDuplicates([candidate], existing);
    expect(annotated.isDuplicate).toBe(true);
  });

  it('returns false for every candidate when there are no existing entries', () => {
    const candidate = makeCandidate({ date: '2026-07-02', departureAirport: 'NQZ', arrivalAirport: 'FRA' });
    const [annotated] = annotateDuplicates([candidate], []);
    expect(annotated.isDuplicate).toBe(false);
  });
});
