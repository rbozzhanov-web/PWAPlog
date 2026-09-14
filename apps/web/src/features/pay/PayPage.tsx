import { EMPTY_PAY_SETTINGS, calculatePayPeriod, lookupNormMinutes, parseCrewSchedule, summarisePayHours, type MonthlyDays, type PaySettings, type ParsedCrewSchedule } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';

import type { PilotLogbookDb } from '../../db/database';
import { loadAimsRoster } from '../roster/aims';
import { extractPdfText } from '../../platform/pdf/extractText';

interface PayPageProps { db: PilotLogbookDb }
const labels: Array<[keyof PaySettings, string, string]> = [
  ['monthlySalaryEur', 'Salary / month', 'EUR'], ['hourlyRateEur', 'Flight-hour rate', 'EUR'],
  ['nightAllowanceEur', 'Night allowance', 'EUR'], ['productivityAllowanceEur', 'Productivity', 'EUR'],
  ['vacationDayRateTenge', 'Vacation / day', 'KZT'], ['trainingDayRateTenge', 'Training / day', 'KZT'], ['medicalExamDayRateTenge', 'Medical / day', 'KZT'],
  ['transportAllowance', 'Transport', 'KZT'], ['corporatePensionRate', 'CorpPP rate', 'fraction'],
  ['advance', 'Advance', 'KZT'], ['alimonyRate', 'Alimony rate', 'fraction'],
];
const money = (value: number) => new Intl.NumberFormat('ru-KZ', { maximumFractionDigits: 0 }).format(value);

export function PayPage({ db }: PayPageProps) {
  const roster = useMemo(() => loadAimsRoster(), []);
  const month = roster?.period.start.slice(0, 7);
  const [settings, setSettings] = useState<PaySettings>(EMPTY_PAY_SETTINGS);
  const [rate, setRate] = useState(0);
  const [taxableYtd, setTaxableYtd] = useState(0);
  const [saved, setSaved] = useState(false);
  const [pdfSchedules, setPdfSchedules] = useState<ParsedCrewSchedule[]>([]);
  const [activePdfMonth, setActivePdfMonth] = useState<string>();
  const [pdfError, setPdfError] = useState<string>();

  const activePdf = pdfSchedules.find((schedule) => schedule.month === activePdfMonth);
  const payMonth = activePdf?.month ?? month;
  useEffect(() => { void db.crewSchedules.toArray().then((schedules) => setPdfSchedules(schedules)); }, [db]);
  useEffect(() => { void Promise.all([db.settings.get('pay-settings'), payMonth ? db.exchangeRates.get(payMonth) : undefined, payMonth ? db.taxableYtdOverrides.get(payMonth) : undefined]).then(([stored, fx, ytd]) => { if (stored) setSettings(stored); setRate(fx?.rate ?? 0); setTaxableYtd(ytd?.taxableIncome ?? 0); }); }, [db, payMonth]);
  const aimsSectors = roster?.duties.flatMap((duty) => duty.flights).filter((flight) => !flight.deadhead).map((flight) => ({ date: flight.date, departureAirport: flight.origin, arrivalAirport: flight.destination, totalTimeMinutes: 0 })) ?? [];
  const days: MonthlyDays = useMemo(() => {
    const vacation = roster?.absences.filter((item) => item.code === 'VAC' && item.date.startsWith(month ?? '')).map((item) => item.date) ?? [];
    const paidVacationDays = vacation.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0).length;
    const activities = roster?.activities?.filter((item) => item.date.startsWith(month ?? '')) ?? [];
    const medicalExamDays = activities.filter((item) => /^MED(?:\d|A)/.test(item.code)).length;
    const trainingDays = activities.filter((item) => /^(GRTC|TRN|SIM|LPC|OPC)/.test(item.code)).length;
    return { vacationDays: vacation.length, paidVacationDays, trainingDays, medicalExamDays };
  }, [roster, month]);
  const sectors = activePdf?.sectors ?? aimsSectors;
  const payDays = activePdf?.days ?? days;
  const result = payMonth && rate > 0 ? calculatePayPeriod(sectors, payMonth, settings, { [payMonth]: rate }, { [payMonth]: payDays }, undefined, payMonth ? { [payMonth]: taxableYtd } : {}) : undefined;
  const hours = useMemo(() => summarisePayHours(sectors), [sectors]);
  const save = async () => { await db.settings.put({ id: 'pay-settings', ...settings }); if (payMonth && rate > 0) { await db.exchangeRates.put({ month: payMonth, rate, source: 'manual', updatedAt: new Date().toISOString() }); await db.taxableYtdOverrides.put({ month: payMonth, taxableIncome: taxableYtd, updatedAt: new Date().toISOString() }); } setSaved(true); };
  const setValue = (key: keyof PaySettings, value: string) => setSettings((current) => ({ ...current, [key]: Number(value) || 0 }));
  const importSchedulePdf = async (file?: File) => { if (!file) return; setPdfError(undefined); try { const parsed = parseCrewSchedule(await extractPdfText(file)); await db.crewSchedules.put({ ...parsed, importedAt: new Date().toISOString() }); setPdfSchedules((current) => [...current.filter((item) => item.month !== parsed.month), parsed]); setActivePdfMonth(parsed.month); } catch (reason) { setPdfError(reason instanceof Error ? reason.message : 'Could not read this Crew Schedule PDF.'); } };

  return <main className="pay-page">
    <header className="suite-page-header"><div className="tab-header__identity"><p>CREW PAY</p><h1>Pay</h1></div></header>
    <p className="tab-page-note">AIMS sectors → CrewPay norms → payroll rules already built into PWAPlog.</p>
    <section className="pay-pdf-check">
      <p>Current month uses the locally imported AIMS Web Archive. For completed months, import the AIMS Personal Crew Schedule PDF.</p>
      <label className="roster-import-action">Import Crew Schedule PDF<input type="file" accept="application/pdf" onChange={(event) => void importSchedulePdf(event.target.files?.[0])} /></label>
      {pdfSchedules.length ? <div className="pay-source-list"><button type="button" className={!activePdf ? 'is-active' : ''} onClick={() => setActivePdfMonth(undefined)} disabled={!month}>Current AIMS {month ?? 'unavailable'}</button>{pdfSchedules.map((schedule) => <button type="button" className={activePdfMonth === schedule.month ? 'is-active' : ''} onClick={() => setActivePdfMonth(schedule.month)} key={schedule.month}>PDF {schedule.month}</button>)}</div> : null}
      {activePdf ? <p>PDF {activePdf.month}: {activePdf.sectors.length} operating sectors · {formatHours(summarisePayHours(activePdf.sectors).totalMinutes)} CrewPay norms. Saved locally as the Pay source for this month.</p> : null}
      {pdfError ? <p className="roster-import-error">{pdfError}</p> : null}
    </section>
    {!payMonth ? <section className="roster-empty-card"><span aria-hidden="true">₸</span><h2>Import a source for Pay</h2><p>Use the current AIMS Web Archive or a historical AIMS Personal Crew Schedule PDF.</p></section> : <>
      <section className="pay-setup"><label>EUR / KZT for {payMonth}<input inputMode="decimal" value={rate || ''} placeholder="Rate" onChange={(event) => setRate(Number(event.target.value) || 0)} /></label><label>Taxable YTD before {payMonth}<span>KZT</span><input inputMode="decimal" value={taxableYtd || ''} placeholder="From payslip" onChange={(event) => setTaxableYtd(Number(event.target.value) || 0)} /></label>{labels.map(([key, label, unit]) => <label key={key}>{label}<span>{unit}</span><input inputMode="decimal" value={settings[key] || ''} onChange={(event) => setValue(key, event.target.value)} /></label>)}<button type="button" onClick={() => void save()}>Save local pay settings</button>{saved ? <p>Saved only on this device.</p> : null}</section>
      {result ? <><section className="pay-result"><p>{payMonth} · {formatHours(result.hours.totalMinutes)} paid norm time</p><h2>{money(result.payroll.netPay)} ₸</h2><span>Estimated take-home</span><div><p>Gross <strong>{money(result.earnings.total)} ₸</strong></p><p>Salary <strong>{money(result.earnings.salary)} ₸</strong></p><p>Flight pay <strong>{money(result.earnings.flightPay)} ₸</strong></p><p>Night allowance <strong>{money(result.earnings.nightAllowance)} ₸</strong></p><p>Productivity <strong>{money(result.earnings.productivityAllowance)} ₸</strong></p><p>Transport <strong>{money(result.earnings.transportAllowance)} ₸</strong></p><p>Tax & deductions <strong>{money(result.payroll.totalDeductions)} ₸</strong></p>{payDays.vacationDays || payDays.trainingDays || payDays.medicalExamDays ? <p>Paid days <strong>VAC {payDays.paidVacationDays} · TRN {payDays.trainingDays} · MED {payDays.medicalExamDays}</strong></p> : null}</div></section><section className="pay-audit"><header><p>PAYSLIP CHECK</p><h2>Calculation detail</h2><span>Source: {activePdf ? `AIMS PDF ${activePdf.month}` : 'current AIMS Web Archive'}</span></header><div className="pay-audit__totals"><p>Norm sectors <strong>{hours.sectorsOnNorm}</strong></p><p>Actual-time sectors <strong>{hours.sectorsOnActual}</strong></p><p>EUR / KZT <strong>{result.eurToKztRateUsed}</strong></p></div><AuditGroup title="Earnings" rows={[["Salary", result.earnings.salary], ["Flight pay", result.earnings.flightPay], ["Night allowance", result.earnings.nightAllowance], ["Productivity", result.earnings.productivityAllowance], ["Transport", result.earnings.transportAllowance], ["Vacation / training / MED", result.earnings.vacationPay + result.earnings.trainingPay + result.earnings.medicalExamPay], ["Indirect income (CorpPP)", result.earnings.indirectIncome]]} /><AuditGroup title="Deductions" rows={[["OPV", result.payroll.opv], ["OSMS", result.payroll.vosms], ["IPN", result.payroll.ipn], ["CorpPP employee", result.payroll.voluntaryPension], ["Alimony", result.payroll.alimony], ["Advance & indirect income", result.payroll.otherDeductions]]} /><div className="pay-audit__sectors"><p>Sector norms</p>{sectors.map((sector, index) => { const norm = lookupNormMinutes(sector.departureAirport, sector.arrivalAirport); const minutes = norm ?? sector.totalTimeMinutes; return <div key={`${sector.date}-${sector.departureAirport}-${sector.arrivalAirport}-${index}`}><span>{sector.date.slice(8)} · {sector.departureAirport} → {sector.arrivalAirport}</span><strong>{formatHours(minutes)} <small>{norm === undefined ? 'actual' : 'norm'}</small></strong></div>; })}</div>{hours.unlistedSectors.length ? <p className="pay-audit__warning">No published norm: {hours.unlistedSectors.join(', ')}. The calculation uses actual time, so check the source PDF.</p> : null}{result.ytdOverrideMonth ? <p className="pay-audit__note">IPN uses the taxable YTD value saved before {result.ytdOverrideMonth}.</p> : null}</section></> : <p className="pay-hint">Enter the EUR/KZT rate and your stored terms to calculate this roster.</p>}
    </>}
  </main>;
}
function formatHours(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; }
function AuditGroup({ title, rows }: { title: string; rows: Array<[string, number]> }) { return <div className="pay-audit__group"><p>{title}</p>{rows.filter(([, value]) => value !== 0).map(([label, value]) => <div key={label}><span>{label}</span><strong>{money(value)} ₸</strong></div>)}</div>; }
