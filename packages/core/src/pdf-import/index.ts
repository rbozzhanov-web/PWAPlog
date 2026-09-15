/**
 * The PDF-import surface, deliberately kept off the package barrel.
 *
 * Parsing a roster pulls in the parser rules, which compute real day/night times and canonicalise
 * airport codes against the full 855 KB airport dataset. That is the right thing to do during an
 * import and the wrong thing to ship in the app's entry chunk, which is what a re-export from the
 * barrel meant: every launch parsed the dataset to render a logbook list. Importing this module
 * directly keeps it in the lazily loaded import route, where it is actually used.
 */
export type {
  CrossCheck,
  ExtractedPage,
  ParseConfidence,
  ParsedCandidate,
  ParseResult,
  ParserRule,
  TextItem,
} from './types';
export { annotateDuplicates, type AnnotatedCandidate } from './dedupe';
export { parseRoster } from './parseRoster';
export { tokenizeLines, nearestItem, type Line } from './tokenize';
export {
  AIRPORT_CODE_RE,
  DATE_DDMMYY_RE,
  DATE_DDMMYYYY_RE,
  FLIGHT_NUMBER_RE,
  REGISTRATION_RE,
  TIME_HHMM_RE,
  isAirportCodeToken,
  isTimeToken,
  parseDateDdMmYy,
  parseDateDdMmYyyy,
} from './patterns';
