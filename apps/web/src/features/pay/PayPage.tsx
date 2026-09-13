import { EMPTY_PAY_SETTINGS, calculatePayPeriod, type PaySettings } from '@pilot-logbook/core';
import { useEffect, useMemo, useState } from 'react';

import type { PilotLogbookDb } from '../../db/database';
import { loadAimsRoster } from '../roster/aims';

interface PayPageProps { db: PilotLogbookDb }
const labels: Array<[keyof PaySettings, string, string]> = [
  ['monthlySalaryEur', 'Salary / month', 'EUR'], ['hourlyRateEur', 'Flight-hour rate', 'EUR'],
  ['nightAllowanceEur', 'Night allowance', 'EUR'], ['productivityAllowanceEur', 'Productivity', 'EUR'],
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

  useEffect(() => { void Promise.all([db.settings.get('pay-settings'), month ? db.exchangeRates.get(month) : undefined]).then(([stored, fx]) => { if (stored) setSettings(stored); if (fx) setRate(fx.rate); }); }, [db, month]);
  const sectors = roster?.duties.flatMap((duty) => duty.flights).filter((flight) => !flight.deadhead).map((flight) => ({ date: flight.date, departureAirport: flight.origin, arrivalAirport: flight.destination, totalTimeMinutes: 0 })) ?? [];
  const result = month && rate > 0 ? calculatePayPeriod(sectors, month, settings, { [month]: rate }) : undefined;
  const save = async () => { await db.settings.put({ id: 'pay-settings', ...settings }); if (month && rate > 0) await db.exchangeRates.put({ month, rate, source: 'manual', updatedAt: new Date().toISOString() }); setSaved(true); };
  const setValue = (key: keyof PaySettings, value: string) => setSettings((current) => ({ ...current, [key]: Number(value) || 0 }));

  return <main className="pay-page">
    <header className="suite-page-header"><p>CREW PAY</p><h1>Pay</h1><span>AIMS sectors → CrewPay norms → payroll rules already built into PWAPlog.</span></header>
    {!roster || !month ? <section className="roster-empty-card"><span aria-hidden="true">₸</span><h2>Import an AIMS roster first</h2><p>Pay uses the factual sector dates and routes from your locally saved Web Archive.</p></section> : <>
      <section className="pay-setup"><label>EUR / KZT for {month}<input inputMode="decimal" value={rate || ''} placeholder="Rate" onChange={(event) => setRate(Number(event.target.value) || 0)} /></label>{labels.map(([key, label, unit]) => <label key={key}>{label}<span>{unit}</span><input inputMode="decimal" value={settings[key] || ''} onChange={(event) => setValue(key, event.target.value)} /></label>)}<button type="button" onClick={() => void save()}>Save local pay settings</button>{saved ? <p>Saved only on this device.</p> : null}</section>
      {result ? <section className="pay-result"><p>{month} · {result.hours.totalMinutes / 60} norm hours</p><h2>{money(result.payroll.netPay)} ₸</h2><span>Estimated take-home</span><div><p>Gross <strong>{money(result.earnings.total)} ₸</strong></p><p>Flight pay <strong>{money(result.earnings.flightPay)} ₸</strong></p><p>Tax & deductions <strong>{money(result.payroll.totalDeductions)} ₸</strong></p></div></section> : <p className="pay-hint">Enter the EUR/KZT rate and your stored terms to calculate this roster.</p>}
    </>}
  </main>;
}
