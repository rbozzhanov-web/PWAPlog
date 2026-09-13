import { EMPTY_PAY_SETTINGS, calculatePayPeriod, parseCrewSchedule, summarisePayHours, type MonthlyDays, type PaySettings, type ParsedCrewSchedule } from '@pilot-logbook/core';
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
  const [saved, setSaved] = useState(false);
  const [pdfCheck, setPdfCheck] = useState<ParsedCrewSchedule>();
  const [pdfError, setPdfError] = useState<string>();

  useEffect(() => { void Promise.all([db.settings.get('pay-settings'), month ? db.exchangeRates.get(month) : undefined]).then(([stored, fx]) => { if (stored) setSettings(stored); if (fx) setRate(fx.rate); }); }, [db, month]);
  const sectors = roster?.duties.flatMap((duty) => duty.flights).filter((flight) => !flight.deadhead).map((flight) => ({ date: flight.date, departureAirport: flight.origin, arrivalAirport: flight.destination, totalTimeMinutes: 0 })) ?? [];
  const days: MonthlyDays = useMemo(() => {
    const vacation = roster?.absences.filter((item) => item.code === 'VAC' && item.date.startsWith(month ?? '')).map((item) => item.date) ?? [];
    const paidVacationDays = vacation.filter((date) => new Date(`${date}T00:00:00Z`).getUTCDay() !== 0).length;
    const activities = roster?.activities?.filter((item) => item.date.startsWith(month ?? '')) ?? [];
    const medicalExamDays = activities.filter((item) => /^MED(?:\d|A)/.test(item.code)).length;
    const trainingDays = activities.filter((item) => /^(GRTC|TRN|SIM|LPC|OPC)/.test(item.code)).length;
    return { vacationDays: vacation.length, paidVacationDays, trainingDays, medicalExamDays };
  }, [roster, month]);
  const result = month && rate > 0 ? calculatePayPeriod(sectors, month, settings, { [month]: rate }, { [month]: days }) : undefined;
  const save = async () => { await db.settings.put({ id: 'pay-settings', ...settings }); if (month && rate > 0) await db.exchangeRates.put({ month, rate, source: 'manual', updatedAt: new Date().toISOString() }); setSaved(true); };
  const setValue = (key: keyof PaySettings, value: string) => setSettings((current) => ({ ...current, [key]: Number(value) || 0 }));
  const importSchedulePdf = async (file?: File) => { if (!file) return; setPdfError(undefined); try { const parsed = parseCrewSchedule(await extractPdfText(file)); setPdfCheck(parsed); } catch (reason) { setPdfError(reason instanceof Error ? reason.message : 'Could not read this Crew Schedule PDF.'); } };

  return <main className="pay-page">
    <header className="suite-page-header"><p>CREW PAY</p><h1>Pay</h1><span>AIMS sectors → CrewPay norms → payroll rules already built into PWAPlog.</span></header>
    {!roster || !month ? <section className="roster-empty-card"><span aria-hidden="true">₸</span><h2>Import an AIMS roster first</h2><p>Pay uses the factual sector dates and routes from your locally saved Web Archive.</p></section> : <>
      <section className="pay-setup"><label>EUR / KZT for {month}<input inputMode="decimal" value={rate || ''} placeholder="Rate" onChange={(event) => setRate(Number(event.target.value) || 0)} /></label>{labels.map(([key, label, unit]) => <label key={key}>{label}<span>{unit}</span><input inputMode="decimal" value={settings[key] || ''} onChange={(event) => setValue(key, event.target.value)} /></label>)}<button type="button" onClick={() => void save()}>Save local pay settings</button>{saved ? <p>Saved only on this device.</p> : null}</section>
      <section className="pay-pdf-check"><label className="roster-import-action">Check Crew Schedule PDF<input type="file" accept="application/pdf" onChange={(event) => void importSchedulePdf(event.target.files?.[0])} /></label>{pdfCheck ? <p>PDF {pdfCheck.month}: {pdfCheck.sectors.length} operating sectors · {formatHours(summarisePayHours(pdfCheck.sectors).totalMinutes)} CrewPay norms. Used as a local audit only.</p> : null}{pdfError ? <p className="roster-import-error">{pdfError}</p> : null}</section>
      {result ? <section className="pay-result"><p>{month} · {result.hours.totalMinutes / 60} norm hours</p><h2>{money(result.payroll.netPay)} ₸</h2><span>Estimated take-home</span><div><p>Gross <strong>{money(result.earnings.total)} ₸</strong></p><p>Salary <strong>{money(result.earnings.salary)} ₸</strong></p><p>Flight pay <strong>{money(result.earnings.flightPay)} ₸</strong></p><p>Night allowance <strong>{money(result.earnings.nightAllowance)} ₸</strong></p><p>Productivity <strong>{money(result.earnings.productivityAllowance)} ₸</strong></p><p>Transport <strong>{money(result.earnings.transportAllowance)} ₸</strong></p><p>Tax & deductions <strong>{money(result.payroll.totalDeductions)} ₸</strong></p>{days.vacationDays || days.trainingDays || days.medicalExamDays ? <p>AIMS paid days <strong>VAC {days.paidVacationDays} · TRN {days.trainingDays} · MED {days.medicalExamDays}</strong></p> : null}</div></section> : <p className="pay-hint">Enter the EUR/KZT rate and your stored terms to calculate this roster.</p>}
    </>}
  </main>;
}
function formatHours(minutes: number) { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; }
