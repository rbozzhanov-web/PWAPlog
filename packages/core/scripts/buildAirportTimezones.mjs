/**
 * Generates `assets/airportTimezones.json`: the IANA zone each station sits in.
 *
 * AIMS prints every time on the clock of the station it happens at, so turning a roster into real
 * block times needs each station's UTC offset on the day of the flight — which is a timezone
 * question, not a longitude one (Kazakhstan runs one zone across 20° of longitude; Germany changes
 * offset twice a year).
 *
 * Resolved here at authoring time rather than at runtime: tz-lookup ships a ~100 KB encoded world
 * map, and the app only needs the answers. The output is keyed by zone with the 3-letter IATA
 * codes concatenated — fixed width, so a code is a substring scan — which costs ~20 KB gzipped
 * against ~60 KB for the obvious `{code: zone}` object.
 *
 * Deliberately separate from `airports.json`: that dataset is 855 KB and is kept out of the app's
 * entry chunk on purpose (see the note in `src/index.ts`), and this has to be in it.
 *
 * Re-run with:  node packages/core/scripts/buildAirportTimezones.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import tzLookup from 'tz-lookup';

const airports = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/daynight/assets/airports.json', import.meta.url)), 'utf8'),
);

const byZone = new Map();
let unresolved = 0;
for (const airport of airports) {
  const iata = airport.iata?.toUpperCase();
  if (!iata || iata.length !== 3) continue;
  let zone;
  try {
    zone = tzLookup(airport.lat, airport.lon);
  } catch {
    // Out-of-range coordinates. Omitting the station is the honest outcome: callers fall back
    // rather than being handed an invented offset.
    unresolved += 1;
    continue;
  }
  if (!byZone.has(zone)) byZone.set(zone, []);
  byZone.get(zone).push(iata);
}

const packed = {};
for (const zone of [...byZone.keys()].sort()) packed[zone] = [...new Set(byZone.get(zone))].sort().join('');

const target = fileURLToPath(new URL('../src/daynight/assets/airportTimezones.json', import.meta.url));
writeFileSync(target, JSON.stringify(packed));
console.log(`zones: ${Object.keys(packed).length}, stations: ${[...byZone.values()].flat().length}, unresolved: ${unresolved}`);
