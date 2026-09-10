import { lastDayOfMonthDdMmYyyy, parseNbrkEurRate } from '../nbrkRate';

describe('lastDayOfMonthDdMmYyyy', () => {
  it('handles a 31-day month', () => {
    expect(lastDayOfMonthDdMmYyyy('2026-07')).toBe('31.07.2026');
  });

  it('handles a 30-day month', () => {
    expect(lastDayOfMonthDdMmYyyy('2026-04')).toBe('30.04.2026');
  });

  it('handles February in a leap year', () => {
    expect(lastDayOfMonthDdMmYyyy('2024-02')).toBe('29.02.2024');
  });

  it('handles February in a non-leap year', () => {
    expect(lastDayOfMonthDdMmYyyy('2026-02')).toBe('28.02.2026');
  });

  it('handles December without rolling into the next year', () => {
    expect(lastDayOfMonthDdMmYyyy('2026-12')).toBe('31.12.2026');
  });

  it('handles January without borrowing from the previous year', () => {
    expect(lastDayOfMonthDdMmYyyy('2026-01')).toBe('31.01.2026');
  });
});

describe('parseNbrkEurRate', () => {
  // A trimmed real response, verified live against nationalbank.kz for 31.07.2026.
  const REAL_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<rates>
    <generator>Alternate RSS Builder</generator>
    <title>Official exchange rates of National Bank of Republic Kazakhstan</title>
    <link>www.nationalbank.kz</link>
    <date>31.07.2026</date>
    <item>
        <fullname>ДОЛЛАР США</fullname>
        <title>USD</title>
        <description>474.2</description>
        <quant>1</quant>
        <index>UP</index>
        <change>+0.51</change>
    </item>
    <item>
        <fullname>ЕВРО</fullname>
        <title>EUR</title>
        <description>544.5</description>
        <quant>1</quant>
        <index>UP</index>
        <change>+1.24</change>
    </item>
</rates>`;

  it('extracts the EUR rate from a real response', () => {
    expect(parseNbrkEurRate(REAL_RESPONSE)).toBe(544.5);
  });

  it('divides by quant when EUR is (hypothetically) quoted per multiple units', () => {
    const xml = `<item><title>EUR</title><description>317.4</description><quant>100</quant></item>`;
    expect(parseNbrkEurRate(xml)).toBeCloseTo(3.174, 6);
  });

  it('never matches "EUR" as a substring of another currency\'s block', () => {
    // A decoy item whose fullname contains "EUR" as a substring, with an implausible rate that
    // would prove a substring match rather than a real <title> match if it were picked up.
    const xml = `<item><fullname>EUROCURRENCY DECOY</fullname><title>XXX</title><description>999999</description><quant>1</quant></item>`;
    expect(parseNbrkEurRate(xml)).toBeUndefined();
  });

  it('returns undefined rather than throwing when there is no EUR item', () => {
    const xml = `<item><title>USD</title><description>474.2</description><quant>1</quant></item>`;
    expect(parseNbrkEurRate(xml)).toBeUndefined();
  });

  it('returns undefined on malformed input instead of throwing', () => {
    expect(parseNbrkEurRate('not xml at all')).toBeUndefined();
  });
});
