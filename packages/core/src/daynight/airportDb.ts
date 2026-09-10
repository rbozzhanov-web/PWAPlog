import airportsData from './assets/airports.json';

export interface AirportCoords {
  lat: number;
  lon: number;
}

interface AirportRecord {
  ident: string | null;
  iata: string | null;
  icao: string | null;
  lat: number;
  lon: number;
}

const ICAO_RE = /^[A-Z]{4}$/;

const byIata = new Map<string, AirportRecord>();
const byIcao = new Map<string, AirportRecord>();
/** Resolved ICAO per record, so `toIcaoCode` doesn't redo the ident fallback on every call. */
const icaoOf = new Map<AirportRecord, string>();

for (const record of airportsData as AirportRecord[]) {
  if (record.iata) byIata.set(record.iata.toUpperCase(), record);
  if (record.icao) byIcao.set(record.icao.toUpperCase(), record);

  // ~300 records carry no `icao` but their `ident` is already an ICAO code (the source dataset
  // uses `ident` as the primary key and only fills `icao` when it differs).
  const icao = record.icao?.toUpperCase() ?? record.ident?.toUpperCase();
  if (icao && ICAO_RE.test(icao)) icaoOf.set(record, icao);
}

/**
 * Codes the bundled dataset can't resolve, checked before it.
 *
 * Two distinct causes, both real:
 *  - an IATA code was retired, so the dataset only knows the airport by its replacement;
 *  - the dataset itself is wrong or stale for that airport.
 *
 * This is deliberately a short, evidenced list rather than a guess at every code change since
 * 2016 — an invented mapping in a licence document is worse than none. Anything not covered here
 * is reported unresolved by `resolveIcaoCode` so it surfaces for checking instead of passing
 * silently. Append here as real cases appear.
 */
const CODE_OVERRIDES: Record<string, string> = {
  // Astana. IATA TSE was retired in 2020 when the airport was renamed; the dataset carries it
  // only as NQZ, so every pre-2020 logbook entry misses.
  TSE: 'UACC',
  // Bishkek Manas. The dataset record is wrong — it lists IATA "BSZ", but Manas is FRU.
  FRU: 'UCFM',
  // ...and the same airport's ICAO moved when Kyrgyzstan was allocated the UC** block; entries
  // written with the old prefix should follow.
  UAFM: 'UCFM',
};

function findRecord(code: string): AirportRecord | undefined {
  // ICAO first: codes are 4 letters and IATA are 3, so the two namespaces can't collide.
  return byIcao.get(code) ?? byIata.get(code);
}

/** Looks up an airport's coordinates by IATA (3-letter) or ICAO (4-letter) code. */
export function findAirportCoords(code: string): AirportCoords | undefined {
  const normalized = code.trim().toUpperCase();
  const record = findRecord(CODE_OVERRIDES[normalized] ?? normalized);
  return record ? { lat: record.lat, lon: record.lon } : undefined;
}

export interface IcaoResolution {
  /** The ICAO code, or the input uppercased when it couldn't be resolved. */
  code: string;
  /**
   * False when the code isn't in the dataset, or the airport genuinely has no ICAO (many small
   * fields don't). The input is kept either way — never discard what the pilot actually flew —
   * but callers can flag it for checking rather than trusting it silently.
   */
  resolved: boolean;
}

/**
 * Canonicalises an airport code to ICAO, reporting whether it actually resolved.
 *
 * A logbook entered or imported with IATA codes (ALA, NQZ) should read as ICAO (UAAA, UACC) —
 * the format licensing authorities expect — but codes drift: IATA gets retired and reassigned,
 * ICAO gets reallocated, and the bundled dataset carries errors of its own. So an unresolved
 * code is a real signal, not an edge case, and is passed back for the caller to surface.
 */
export function resolveIcaoCode(code: string): IcaoResolution {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { code: normalized, resolved: false };

  const override = CODE_OVERRIDES[normalized];
  if (override) return { code: override, resolved: true };

  const record = findRecord(normalized);
  const icao = record && icaoOf.get(record);
  return icao ? { code: icao, resolved: true } : { code: normalized, resolved: false };
}

/** `resolveIcaoCode` when only the code matters. */
export function toIcaoCode(code: string): string {
  return resolveIcaoCode(code).code;
}
