import { PUBLISHED_SECTORS } from '../normsTable';
import { toNormIcaoCode } from '../normAirports';
import { toIcaoCode } from '../../daynight/airportDb';
import airports from '../../daynight/assets/airports.json';

interface AirportRecord { ident: string | null; iata: string | null; icao: string | null }

const tableIcaos = new Set(
  PUBLISHED_SECTORS.flatMap((sector) => [toIcaoCode(sector.dep), toIcaoCode(sector.arr)]),
);

test('every code in the published table resolves the same way as the full dataset', () => {
  for (const sector of PUBLISHED_SECTORS) {
    expect(toNormIcaoCode(sector.dep)).toBe(toIcaoCode(sector.dep));
    expect(toNormIcaoCode(sector.arr)).toBe(toIcaoCode(sector.arr));
  }
});

// The property that makes the generated subset safe: wherever the full dataset would resolve a
// code to an airport the norms table actually names, the subset agrees. Anywhere else the answer
// cannot change a lookup, because no published sector is keyed on it.
test('agrees with the full dataset on every alias that can reach the norms table', () => {
  let checked = 0;
  for (const record of airports as AirportRecord[]) {
    for (const alias of [record.iata, record.icao, record.ident]) {
      if (!alias) continue;
      const full = toIcaoCode(alias);
      if (!tableIcaos.has(full)) continue;
      expect(toNormIcaoCode(alias)).toBe(full);
      checked += 1;
    }
  }
  expect(checked).toBeGreaterThan(100);
});

test('passes an unknown code through uppercased, as the full resolver does', () => {
  expect(toNormIcaoCode('zzzz')).toBe('ZZZZ');
  expect(toNormIcaoCode('  ala  ')).toBe('UAAA');
});

// Retired and mis-listed codes are the reason the resolver exists at all.
test('keeps the retired Astana code pointing at the published airport', () => {
  expect(toNormIcaoCode('TSE')).toBe('UACC');
  expect(toNormIcaoCode('NQZ')).toBe('UACC');
});
