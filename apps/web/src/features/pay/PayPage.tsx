import { EMPTY_PAY_SETTINGS, calculatePayPeriod, lastDayOfMonthDdMmYyyy, lookupNormMinutes, parseCrewSchedule, summarisePayHours, type MonthlyDays, type PaySector, type PaySettings, type ParsedCrewSchedule } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';

import type { PilotLogbookDb } from '../../db/database';
import { listFlightEntries } from '../../db/repositories/flightEntries';
import { fetchNbrkEurRate } from '../../platform/nbrkRate';
import { loadAimsRoster } from '../roster/aims';
import { buildPayInputs, sourcesByMonth, withFormValues } from './payInputs';
import { parseTaxableYtd } from './ytdOverride';

interface PayPageProps { db: PilotLogbookDb }
const labels: Array<[keyof PaySettings, string, string]> = [
  ['monthlySalaryEur', 'Salary / month', 'EUR'], ['hourlyRateEur', 'Flight-hour rate', 'EUR'],
  ['nightAllowanceEur', 'Night allowance', 'EUR'], ['productivityAllowanceEur', 'Productivity', 'EUR'],
  ['vacationDayRateEur', 'Vacation / day', 'EUR'], ['trainingDayRateEur', 'Training / day', 'EUR'], ['medicalExamDayRateEur', 'Medical / day', 'EUR'],
  ['transportAllowance', 'Transport', 'KZT'], ['corporatePensionRate', 'CorpPP rate', '%'],
  ['advance', 'Advance', 'KZT'], ['alimonyRate', 'Alimony rate', '%'],
];

/**
 * The two rates a pilot reads off a contract as a percentage — "25%", not "0.25".
 *
 * Only the field changes. Core works in fractions throughout, and that is what stays in the
 * database, so settings saved before this are already correct and need no migration: the same
 * 0.25 simply shows as 25 now.
 */
const percentFields = new Set<keyof PaySettings>(['corporatePensionRate', 'alimonyRate']);

/** The tenge-denominated names these three carried before they were understood as euro terms. */
const RENAMED_DAY_RATES = [
  ['vacationDayRateTenge', 'vacationDayRateEur'],
  ['trainingDayRateTenge', 'trainingDayRateEur'],
  ['medicalExamDayRateTenge', 'medicalExamDayRateEur'],
] as const;

/**
 * Brings a stored settings record up to date.
 *
 * The three per-day rates moved from tenge to euros. Carrying the old numbers across would read a
 * figure like 250 000 as euros and multiply it by the month's rate — they did not merely change
 * units, they meant something else. So the old keys are dropped and the fields left empty, which
 * shows as blank on screen and asks for the one set of figures only a payslip can supply.
 */
function migrateSettings(stored: PaySettings): PaySettings {
  const migrated = { ...stored } as PaySettings & Record<string, number | undefined>;
  for (const [oldKey, newKey] of RENAMED_DAY_RATES) {
    if (migrated[oldKey] !== undefined) {
      delete migrated[oldKey];
      migrated[newKey] = 0;
    }
  }
  return migrated;
}

/** Scales a stored fraction for display, trimming the float noise 0.07 × 100 leaves behind. */
function toPercent(value: number): number {
  return Number((value * 100).toPrecision(12));
}
const money = (value: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(value);

export function PayPage({ db }: PayPageProps) {
  const [roster, setRoster] = useState(() => loadAimsRoster());
  const month = roster?.period.start.slice(0, 7);
  const [settings, setSettings] = useState<PaySettings>(EMPTY_PAY_SETTINGS);
  const [rate, setRate] = useState(0);
  // undefined means 'not entered'. Zero is a real claim about the year — see ytdOverride.ts.
  const [taxableYtd, setTaxableYtd] = useState<number>();
  const [saved, setSaved] = useState(false);
  const [pdfSchedules, setPdfSchedules] = useState<ParsedCrewSchedule[]>([]);
  const [storedRates, setStoredRates] = useState<Record<string, number>>({});
  const [storedYtd, setStoredYtd] = useState<Record<string, number>>({});
  const [loggedSectors, setLoggedSectors] = useState<PaySector[]>([]);
  const [activePdfMonth, setActivePdfMonth] = useState<string>();
  const [pdfError, setPdfError] = useState<string>();
  const [rateSource, setRateSource] = useState<'stored' | 'fetching' | 'nbrk' | 'unavailable'>('stored');
  const [rateFor, setRateFor] = useState<{ fdate: string; provisional: boolean }>();

  const activePdf = pdfSchedules.find((schedule) => schedule.month === activePdfMonth);
  const payMonth = activePdf?.month ?? month;
  // ИПН bands on the cumulative year, so the replay needs every month it can get — not just the
  // one on screen. All of this is already in the database, one row per month.
  useEffect(() => {
    let live = true;
    void Promise.all([db.crewSchedules.toArray(), db.exchangeRates.toArray(), db.taxableYtdOverrides.toArray(), listFlightEntries(db)])
      .then(([schedules, rates, overrides, entries]) => {
        if (!live) return;
        setPdfSchedules(schedules);
        setStoredRates(Object.fromEntries(rates.map((row) => [row.month, row.rate])));
        setStoredYtd(Object.fromEntries(overrides.map((row) => [row.month, row.taxableIncome])));
        setLoggedSectors(entries.map((entry) => ({ date: entry.date, departureAirport: entry.departureAirport, arrivalAirport: entry.arrivalAirport, totalTimeMinutes: entry.totalTimeMinutes })));
      });
    return () => { live = false; };
  }, [db]);
  useEffect(() => {
    const refreshRoster = () => setRoster(loadAimsRoster());
    window.addEventListener('aims-roster-updated', refreshRoster);
    return () => window.removeEventListener('aims-roster-updated', refreshRoster);
  }, []);
  useEffect(() => {
    let live = true;
    void db.settings.get('pay-settings').then((stored) => { if (live && stored) setSettings(migrateSettings(stored)); });
    return () => { live = false; };
  }, [db]);
  // The two month-specific fields follow the month being calculated, so switching source shows
  // what is stored for it rather than what was typed for the last one.
  useEffect(() => {
    let live = true;
    void Promise.all([
      payMonth ? db.exchangeRates.get(payMonth) : undefined,
      payMonth ? db.taxableYtdOverrides.get(payMonth) : undefined,
    ]).then(async ([fx, ytd]) => {
      if (!live) return;
      setTaxableYtd(ytd?.taxableIncome);
      if (fx?.rate) { setRate(fx.rate); setRateSource('stored'); return; }

      // Nothing saved for this month, so ask the National Bank rather than making the pilot look
      // it up. It is the rate the contract converts at, and it is a fact, not a preference — but
      // the field stays editable, and a failure just leaves it empty to be typed.
      setRate(0);
      if (!payMonth) { setRateSource('stored'); return; }
      setRateSource('fetching');
      try {
        const fetched = await fetchNbrkEurRate(payMonth);
        if (!live) return;
        setRate(fetched.rate);
        setRateFor({ fdate: fetched.fdate, provisional: fetched.provisional });
        setRateSource('nbrk');
      } catch {
        if (live) setRateSource('unavailable');
      }
    });
    return () => { live = false; };
  }, [db, payMonth]);
  const aimsSectors = useMemo(() => roster?.duties.flatMap((duty) => duty.flights).filter((flight) => !flight.deadhead).map((flight) => ({ date: flight.date, departureAirport: flight.origin, arrivalAirport: flight.destination, totalTimeMinutes: 0 })) ?? [], [roster]);
  const days: MonthlyDays = useMemo(() => {
    const vacation = roster?.absences.filter((item) => item.code === 'VAC' && item.date.startsWith(month ?? '')).map((item) => item.date) ?? [];
    const paidVacationDays = vacation.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0).length;
    const activities = roster?.activities?.filter((item) => item.date.startsWith(month ?? '')) ?? [];
    const medicalExamDays = activities.filter((item) => /^MED(?:\d|A)/.test(item.code)).length;
    const trainingDays = activities.filter((item) => /^(GRTC|TRN|SIM|LPC|OPC)/.test(item.code)).length;
    return { vacationDays: vacation.length, paidVacationDays, trainingDays, medicalExamDays };
  }, [roster, month]);
  const payDays = activePdf?.days ?? days;
  const inputs = useMemo(() => buildPayInputs(
    [
      pdfSchedules.map((schedule) => ({ month: schedule.month, sectors: schedule.sectors, days: schedule.days })),
      month ? [{ month, sectors: aimsSectors, days }] : [],
      sourcesByMonth(loggedSectors),
    ],
    payMonth ? { month: payMonth, sectors: activePdf?.sectors ?? aimsSectors, days: payDays } : undefined,
  ), [pdfSchedules, aimsSectors, month, days, loggedSectors, payMonth, activePdf, payDays]);
  const sectors = activePdf?.sectors ?? aimsSectors;
  const rates = useMemo(() => withFormValues(storedRates, payMonth, rate > 0 ? rate : undefined), [storedRates, payMonth, rate]);
  const ytdOverrides = useMemo(() => withFormValues(storedYtd, payMonth, taxableYtd), [storedYtd, payMonth, taxableYtd]);
  const result = payMonth && rate > 0 ? calculatePayPeriod(inputs.sectors, payMonth, settings, rates, inputs.monthlyDays, undefined, ytdOverrides) : undefined;
  // Everything from where the replay actually starts up to the month on screen. A gap here is not
  // an error — a pilot who started using the app in June has no January — but it silently lowers
  // the year-to-date and so the ИПН band, which is exactly the kind of thing a payslip check is
  // for. Months already covered by a taxable-YTD figure off a payslip are not a gap.
  const monthsWithoutSource = useMemo(
    () => (payMonth ? monthsInYearUpTo(payMonth, result?.ytdOverrideMonth).filter((key) => !inputs.months.includes(key)) : []),
    [payMonth, result?.ytdOverrideMonth, inputs.months],
  );
  const hours = useMemo(() => summarisePayHours(sectors), [sectors]);
  const save = async () => { await db.settings.put({ id: 'pay-settings', ...settings }); if (payMonth && rate > 0) { await db.exchangeRates.put({ month: payMonth, rate, source: 'manual', updatedAt: new Date().toISOString() }); if (taxableYtd === undefined) await db.taxableYtdOverrides.delete(payMonth); else await db.taxableYtdOverrides.put({ month: payMonth, taxableIncome: taxableYtd, updatedAt: new Date().toISOString() }); } setSaved(true); };
  const setValue = (key: keyof PaySettings, value: string) => setSettings((current) => {
    const entered = Number(value) || 0;
    return { ...current, [key]: percentFields.has(key) ? entered / 100 : entered };
  });
  const importSchedulePdf = async (file?: File) => { if (!file) return; setPdfError(undefined); try { // Imported here rather than at module scope: pdf.js and its worker are ~850 KB, and a pilot
      // who never imports a PDF should not pay for them on every launch of the Pay tab.
      const { extractPdfText } = await import('../../platform/pdf/extractText');
      const parsed = parseCrewSchedule(await extractPdfText(file)); await db.crewSchedules.put({ ...parsed, importedAt: new Date().toISOString() }); setPdfSchedules((current) => [...current.filter((item) => item.month !== parsed.month), parsed]); setActivePdfMonth(parsed.month); } catch (reason) { setPdfError(reason instanceof Error ? reason.message : 'Could not read this Crew Schedule PDF.'); } };

  return <main className="pay-page">
    <header className="suite-page-header"><div className="tab-header__identity"><p>CREW PAY</p><h1>Pay</h1></div></header>
    <section className="pay-pdf-check">
      <label className="roster-import-action">Import Crew Schedule PDF<input type="file" accept="application/pdf" onChange={(event) => void importSchedulePdf(event.target.files?.[0])} /></label>
      {pdfSchedules.length ? <div className="pay-source-list"><button type="button" className={!activePdf ? 'is-active' : ''} onClick={() => setActivePdfMonth(undefined)} disabled={!month}>Current AIMS {month ?? 'unavailable'}</button>{pdfSchedules.map((schedule) => <button type="button" className={activePdfMonth === schedule.month ? 'is-active' : ''} onClick={() => setActivePdfMonth(schedule.month)} key={schedule.month}>PDF {schedule.month}</button>)}</div> : null}
      {activePdf ? <p>PDF {activePdf.month}: {activePdf.sectors.length} operating sectors · {formatHours(summarisePayHours(activePdf.sectors).totalMinutes)} CrewPay norms. Saved locally as the Pay source for this month.</p> : null}
      {pdfError ? <p className="roster-import-error">{pdfError}</p> : null}
    </section>
    {!payMonth ? <section className="roster-empty-card"><span aria-hidden="true">₸</span><h2>Import a source for Pay</h2><p>Use the current AIMS Web Archive or a historical AIMS Personal Crew Schedule PDF.</p></section> : <>
      <section className="pay-setup"><label>EUR / KZT for {payMonth}<span>{rateSource === 'fetching' ? 'LOADING' : rateSource === 'nbrk' ? 'NBRK' : rateSource === 'unavailable' ? 'ENTER' : 'RATE'}</span><input inputMode="decimal" value={rate || ''} placeholder={rateSource === 'fetching' ? 'Asking the National Bank…' : 'Rate'} onChange={(event) => { setRate(Number(event.target.value) || 0); setRateSource('stored'); }} /></label>{rateSource === 'nbrk' && rateFor ? <p className="pay-setup__note">{rateFor.provisional
        ? `Provisional: the National Bank's rate for ${rateFor.fdate}, standing in until ${lastDayOfMonthDdMmYyyy(payMonth ?? '')} — the day this month actually converts at. Pay will move.`
        : `Official National Bank rate for ${rateFor.fdate}, the day this month converts at.`} Type over it to use your own.</p> : null}{rateSource === 'unavailable' ? <p className="pay-setup__note">Could not reach the National Bank. Enter the EUR/KZT rate for the month's last day.</p> : null}<label>Taxable YTD before {payMonth}<span>KZT</span><input inputMode="decimal" value={taxableYtd ?? ''} placeholder="From payslip" onChange={(event) => setTaxableYtd(parseTaxableYtd(event.target.value))} /></label>{labels.map(([key, label, unit]) => <label key={key}>{label}<span>{unit}</span><input inputMode="decimal" value={(percentFields.has(key) ? toPercent(settings[key]) : settings[key]) || ''} onChange={(event) => setValue(key, event.target.value)} /></label>)}<button type="button" onClick={() => void save()}>Save local pay settings</button>{saved ? <p>Saved only on this device.</p> : null}</section>
      {result ? <><section className="pay-result"><p>{payMonth} · {formatHours(result.hours.totalMinutes)} paid norm time</p><h2>{money(result.payroll.netPay)} ₸</h2><span>Estimated take-home</span><div><p>Gross <strong>{money(result.earnings.total)} ₸</strong></p><p>Salary <strong>{money(result.earnings.salary)} ₸</strong></p><p>Flight pay <strong>{money(result.earnings.flightPay)} ₸</strong></p><p>Night allowance <strong>{money(result.earnings.nightAllowance)} ₸</strong></p><p>Productivity <strong>{money(result.earnings.productivityAllowance)} ₸</strong></p><p>Transport <strong>{money(result.earnings.transportAllowance)} ₸</strong></p><p>Tax & deductions <strong>{money(result.payroll.totalDeductions)} ₸</strong></p>{payDays.vacationDays || payDays.trainingDays || payDays.medicalExamDays ? <p>Paid days <strong>VAC {payDays.paidVacationDays} · TRN {payDays.trainingDays} · MED {payDays.medicalExamDays}</strong></p> : null}</div></section><section className="pay-audit"><header><p>PAYSLIP CHECK</p><h2>Calculation detail</h2><span>Source: {activePdf ? `AIMS PDF ${activePdf.month}` : 'current AIMS Web Archive'}</span></header><div className="pay-audit__totals"><p>Norm sectors <strong>{hours.sectorsOnNorm}</strong></p><p>Actual-time sectors <strong>{hours.sectorsOnActual}</strong></p><p>EUR / KZT <strong>{result.eurToKztRateUsed}</strong></p></div><AuditGroup title="Earnings" rows={[["Salary", result.earnings.salary], ["Flight pay", result.earnings.flightPay], ["Night allowance", result.earnings.nightAllowance], ["Productivity", result.earnings.productivityAllowance], ["Transport", result.earnings.transportAllowance], ["Vacation / training / MED", result.earnings.vacationPay + result.earnings.trainingPay + result.earnings.medicalExamPay], ["Indirect income (CorpPP)", result.earnings.indirectIncome]]} /><AuditGroup title="Deductions" rows={[["OPV", result.payroll.opv], ["OSMS", result.payroll.vosms], ["IPN", result.payroll.ipn], ["CorpPP employee", result.payroll.voluntaryPension], ["Alimony", result.payroll.alimony], ["Advance & indirect income", result.payroll.otherDeductions]]} /><div className="pay-audit__sectors"><p>Sector norms</p>{sectors.map((sector, index) => { const norm = lookupNormMinutes(sector.departureAirport, sector.arrivalAirport); const minutes = norm ?? sector.totalTimeMinutes; return <div key={`${sector.date}-${sector.departureAirport}-${sector.arrivalAirport}-${index}`}><span>{sector.date.slice(8)} · {sector.departureAirport} → {sector.arrivalAirport}</span><strong>{formatHours(minutes)} <small>{norm === undefined ? 'actual' : 'norm'}</small></strong></div>; })}</div>{hours.unlistedSectors.length ? <p className="pay-audit__warning">No published norm: {hours.unlistedSectors.join(', ')}. The calculation uses actual time, so check the source PDF.</p> : null}{result.ytdOverrideMonth ? <p className="pay-audit__note">IPN uses the taxable YTD value saved before {result.ytdOverrideMonth}.</p> : null}{result.fxFallbackMonths.length ? <p className="pay-audit__warning">No EUR/KZT rate saved for {result.fxFallbackMonths.join(', ')}. IPN is banded on the year to date, so those months were replayed on a borrowed rate — save each month's rate to firm this up.</p> : null}{monthsWithoutSource.length ? <p className="pay-audit__warning">No roster, PDF or logbook entries for {monthsWithoutSource.join(', ')}, so the year-to-date behind this month is incomplete. Enter your taxable YTD from a payslip to pin it.</p> : null}</section></> : <p className="pay-hint">Enter the EUR/KZT rate and your stored terms to calculate this roster.</p>}
    </>}
  </main>;
}
function monthsInYearUpTo(month: string, startFrom?: string): string[] {
  const year = month.slice(0, 4);
  const first = startFrom?.slice(0, 4) === year ? Number(startFrom.slice(5, 7)) : 1;
  const last = Number(month.slice(5, 7));
  const months: string[] = [];
  for (let index = first; index <= last; index += 1) months.push(`${year}-${String(index).padStart(2, '0')}`);
  return months;
}
function formatHours(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; }
function AuditGroup({ title, rows }: { title: string; rows: Array<[string, number]> }) { return <div className="pay-audit__group"><p>{title}</p>{rows.filter(([, value]) => value !== 0).map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value)} ₸</strong></div>)}</div>; }
