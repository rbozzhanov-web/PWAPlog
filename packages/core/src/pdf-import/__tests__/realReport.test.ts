import pages from '../__fixtures__/realcheck-pages.json';
import { parseRoster } from '../parseRoster';
import { ExtractedPage } from '../types';

/**
 * Checked-in, scrubbed regression fixture. The original private 16-page report is unavailable in
 * this repository, so this intentionally narrows the real-world parity check to the historical
 * contract that flight and simulator totals remain separate.
 */
describe('the approved Air Astana regression fixture', () => {
  const result = parseRoster(pages as ExtractedPage[]);
  const flights = result.candidates.filter((candidate) => (candidate.fields.simulatorMinutes ?? 0) === 0);
  const simulators = result.candidates.filter((candidate) => (candidate.fields.simulatorMinutes ?? 0) > 0);

  it('uses the airline rule and keeps flight time separate from simulator time', () => {
    expect(result.ruleId).toBe('air-astana-flight-time-report-v1');
    expect(flights).toHaveLength(1);
    expect(simulators).toHaveLength(1);
    expect(flights[0].fields.totalTimeMinutes).toBe(457);
    expect(simulators[0].fields.totalTimeMinutes).toBe(0);
    expect(simulators[0].fields.simulatorMinutes).toBe(360);
    expect(result.crossChecks[0]).toMatchObject({
      parsedTotalMinutes: 457,
      reportedTotalMinutes: 457,
      matches: true,
    });
  });
});
