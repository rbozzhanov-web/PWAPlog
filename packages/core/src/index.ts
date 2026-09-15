export { hhmmToMinutes, minutesToHHMM, minutesToDecimalHours } from './time';
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
/*
 * PDF import is intentionally absent from this barrel: it reaches the 855 KB airport dataset
 * through its parser rules, and re-exporting it here put that dataset in the app's entry chunk.
 * Import it from '@pilot-logbook/core/pdf-import', which the lazily loaded import route does.
 */
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
