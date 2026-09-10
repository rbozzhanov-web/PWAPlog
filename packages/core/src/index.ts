export type { Aircraft, EntrySource, FlightLogEntry } from './logbook/types';
export { NEW_ENTRY_DEFAULTS } from './logbook/types';
export { groupEntries, type MonthGroup } from './logbook/groupEntries';
export { targetMonthForYear, yearsWithEntries } from './logbook/navigation';
export {
  BACKUP_APP_ID,
  BACKUP_FILE_NAME,
  BACKUP_FORMAT_VERSION,
  buildLogbookBackup,
  mergeLogbookBackup,
  parseLogbookBackup,
  serializeLogbookBackup,
  type LogbookBackup,
  type LogbookBackupParseResult,
  type MergeLogbookBackupResult,
} from './backup/logbook';
export type {
  CrossCheck,
  ExtractedPage,
  ParseConfidence,
  ParsedCandidate,
  ParseResult,
  ParserRule,
  TextItem,
} from './pdf-import/types';
export { annotateDuplicates, type AnnotatedCandidate } from './pdf-import/dedupe';
export { parseRoster } from './pdf-import/parseRoster';
export { tokenizeLines, nearestItem, type Line } from './pdf-import/tokenize';
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
} from './pdf-import/patterns';
export {
  CREWPAY_NORM_EFFECTIVE_FROM,
  CREWPAY_NORM_EFFECTIVE_TO,
  CREWPAY_NORM_VERSION,
  PUBLISHED_SECTORS,
  type PublishedSector,
} from './crew-pay/normsTable';
export {
  lookupNormMinutes,
  sectorPayTime,
  summarisePayHours,
  type PayableSector,
  type PayHoursSummary,
  type PayTimeSource,
  type SectorPayTime,
} from './crew-pay/normLookup';
export { parseCrewSchedule, type ParsedCrewSchedule } from './crew-pay/scheduleParser';
export {
  EMPTY_MONTHLY_DAYS,
  EMPTY_PAY_SETTINGS,
  calculateEarnings,
  calculatePayPeriod,
  entriesForMonth,
  resolveMonthlyRate,
  type MonthlyDays,
  type PayEarnings,
  type PayPeriodResult,
  type PaySector,
  type PaySettings,
  type ResolvedRate,
} from './crew-pay/payPeriod';
export {
  KZ_2026,
  calculateNetPay,
  cappedContribution,
  type KzTaxParams,
  type PayrollInput,
  type PayrollResult,
} from './crew-pay/kzPayroll';
export { lastDayOfMonthDdMmYyyy, parseNbrkEurRate } from './crew-pay/nbrkRate';
