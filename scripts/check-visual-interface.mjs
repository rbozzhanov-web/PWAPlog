// Synthetic, device-local fixtures only. No real rosters, crew or PDF files leave a device.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium, webkit } from 'playwright';

const origin = 'http://127.0.0.1:4173';
const output = 'visual-artifacts';
await mkdir(output, { recursive: true });
const server = spawn('npm', ['--workspace', '@pilot-logbook/web', 'exec', '--', 'vite', 'preview', '--host', '127.0.0.1', '--port', '4173'], {
  env: { ...process.env, VITE_BASE_PATH: '/' }, stdio: 'inherit',
});
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(origin)).ok) break; } catch {}
  if (i === 99) throw new Error('Preview server did not start');
  await new Promise(resolve => setTimeout(resolve, 200));
}
const errors = [];
const captures = { light: [], dark: [] };
const routes = ['/', '/roster', '/pay', '/logbook', '/settings'];
const names = ['Home', 'Roster', 'Pay', 'Logbook', 'More'];
const date = '2026-09-14';
const flight = { flightNumber: 'KC921', date, origin: 'NQZ', destination: 'FRA', departure: '12:11', arrival: '16:49', arrivalDate: date, deadhead: false, actualTimes: true, aircraftType: 'B763', crew: [{ name: 'Example Captain', role: 'Flight deck', position: 'CP' }, { name: 'Example Crew With A Deliberately Long Name', role: 'Cabin', position: 'FA' }] };
const roster = {
  period: { start: '2026-09-01', end: '2026-09-30' }, importedAt: '2026-09-14T00:00:00Z', totals: { blockMinutes: 580 },
  duties: [{ date, report: date + 'T10:40', release: date + 'T17:19', start: date + 'T10:40', end: date + 'T17:19', flights: [flight] },
    { date: '2026-09-16', report: '2026-09-16T17:30', start: '2026-09-16T17:30', end: '2026-09-17T07:00', flights: [{ ...flight, date: '2026-09-16', flightNumber: 'KC922', origin: 'FRA', destination: 'NQZ', departure: '18:30', arrival: '06:30', arrivalDate: '2026-09-17' }] }],
  activities: [{ date: '2026-09-13', code: 'OFF', type: 'Day Off', title: 'Day Off', location: 'ALA' }, { date: '2026-09-15', code: 'DOFF', type: 'Day Off Downroute', title: 'Day Off Downroute', location: 'FRA' }, { date, code: 'HOTEL', type: 'Hotel', title: 'Example Hotel With A Long Name', location: 'FRA', start: date + 'T17:19', end: '2026-09-16T17:30' }],
  hotels: [{ station: 'FRA', name: 'Example Hotel With A Long Name', address: '123 Example Street, A long address, Frankfurt, Germany', phone: '+49 000 0000000', locator: 'TEST ONLY' }], absences: [],
};
const zero = Object.fromEntries(['picMinutes','sicMinutes','dualReceivedMinutes','dualGivenMinutes','soloMinutes','dayMinutes','nightMinutes','actualInstrumentMinutes','simulatedInstrumentMinutes','crossCountryMinutes','simulatorMinutes','dayTakeoffs','nightTakeoffs','dayLandings','nightLandings','instrumentApproaches'].map(k => [k, 0]));
const entries = Array.from({ length: 90 }, (_, i) => ({
  ...zero, id: 'visual-example-' + i, date: i < 35 ? '2026-09-' + String(i % 13 + 1).padStart(2, '0') : '2025-08-01',
  departureAirport: 'UAAA', arrivalAirport: 'EDDF', flightNumber: 'KC921', aircraftType: 'B763',
  totalTimeMinutes: 278, source: 'manual', createdAt: date, updatedAt: date, timeOut: '08:00', timeIn: '12:38',
}));
async function seedDb(page) {
  await page.evaluate(async ({ entries, date }) => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pilot-logbook');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    const tx = db.transaction(['flightEntries', 'settings', 'exchangeRates'], 'readwrite');
    for (const entry of entries) tx.objectStore('flightEntries').put(entry);
    tx.objectStore('settings').put({ id: 'pay-settings', monthlySalaryEur: 5000, hourlyRateEur: 25, nightAllowanceEur: 400, productivityAllowanceEur: 300, vacationDayRateTenge: 10000, trainingDayRateTenge: 10000, medicalExamDayRateTenge: 0, transportAllowance: 78000, corporatePensionRate: .05, advance: 138888, alimonyRate: .25 });
    tx.objectStore('exchangeRates').put({ month: '2026-09', rate: 600, source: 'manual', updatedAt: date });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    db.close();
  }, { entries, date });
}
async function select(page, index) {
  await page.locator('.tab-dock__item').nth(index).click();
  try {
    await page.waitForFunction(expected => location.pathname === expected, routes[index]);
    await page.waitForFunction(index => Number(document.querySelector('.tab-dock').style.getPropertyValue('--tab-progress')) === index, index);
    await page.waitForFunction(index => {
      const pager = document.querySelector('.primary-tab-pager');
      return Math.abs(pager.scrollLeft - index * pager.clientWidth) < 1;
    }, index);
  } catch (error) {
    const position = await page.evaluate(() => ({ route: location.pathname, progress: document.querySelector('.tab-dock').style.getPropertyValue('--tab-progress'), left: document.querySelector('.primary-tab-pager')?.scrollLeft }));
    throw new Error('Selecting ' + routes[index] + ': ' + JSON.stringify(position) + ': ' + error.message);
  }
}
async function screenshot(page, key, theme, collect = false) {
  const buffer = await page.screenshot({ path: output + '/' + key + '.jpeg', type: 'jpeg', quality: 65, animations: 'disabled' });
  if (collect) captures[theme].push({ key, image: buffer.toString('base64') });
}
async function checkDock(page, index, key) {
  const metrics = await page.evaluate(index => {
    const dock = document.querySelector('.tab-dock');
    const item = dock.querySelectorAll('.tab-dock__item')[index];
    const lens = dock.querySelector('.tab-dock__indicator');
    const a = item.getBoundingClientRect(), b = lens.getBoundingClientRect();
    const style = getComputedStyle(lens);
    const hit = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2);
    return {
      delta: ['left','right','top','bottom'].map(k => Math.abs(a[k] - b[k])),
      width: a.width, height: a.height, hit: item.contains(hit),
      pageWidth: document.documentElement.scrollWidth, viewport: innerWidth,
      header: document.querySelector('.primary-tab-header')?.getBoundingClientRect().height,
      boxSizing: style.boxSizing, backdrop: style.backdropFilter || style.webkitBackdropFilter,
      bodyScroll: document.documentElement.scrollHeight - innerHeight,
    };
  }, index);
  assert.ok(metrics.delta.every(x => x < 1), key + ': lens does not match cell ' + JSON.stringify(metrics));
  assert.equal(metrics.hit, true, key + ': tab is occluded');
  assert.equal(metrics.boxSizing, 'border-box');
  assert.ok(metrics.backdrop.includes('blur'), key + ': no actual backdrop filter');
  assert.ok(metrics.pageWidth <= metrics.viewport + 1, key + ': horizontal document overflow');
  assert.ok(metrics.bodyScroll < 2, key + ': extra document scroller around the tab pager');
  return metrics;
}
async function checkReachable(page, selector, key, scroll = true) {
  const node = page.locator(selector);
  if (scroll) await node.scrollIntoViewIfNeeded();
  const result = await node.evaluate(el => {
    const a = el.getBoundingClientRect(), dock = document.querySelector('.tab-dock').getBoundingClientRect();
    const hit = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2);
    return { top: a.top, bottom: a.bottom, dockTop: dock.top, visible: el.contains(hit), viewport: innerHeight };
  });
  assert.ok(result.visible && result.top >= 0 && result.bottom <= result.dockTop - 4, key + ': action not reachable ' + JSON.stringify(result));
}
function syntheticPdf() {
  const stream = ['BT /F1 10 Tf', ...Array.from({ length: 25 }, (_, i) =>
    [String(i + 1).padStart(2,'0') + '/07/2026', 'UAAA', 'UACC', '08:00', '09:30']
      .map((token, column) => '1 0 0 1 ' + [25,145,220,300,365][column] + ' ' + (760 - i * 25) + ' Tm (' + token + ') Tj')
  ).flat(), 'ET'].join('\n');
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream'];
  let pdf = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(pdf)); pdf += (i+1)+' 0 obj\n'+objects[i]+'\nendobj\n'; }
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('') + 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(pdf);
}

try {
  for (const [engine, type] of Object.entries({ chromium, webkit })) {
    const browser = await type.launch();
    for (const theme of ['light', 'dark']) {
      for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 844, height: 390 }]) {
        const key = engine + '-' + theme + '-' + viewport.width;
        const context = await browser.newContext({ viewport, colorScheme: theme, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Almaty', serviceWorkers: 'block' });
        const page = await context.newPage(); page.setDefaultTimeout(12000);
        const runtimeErrors = [];
        page.on('pageerror', error => runtimeErrors.push(error.message));
        await page.clock.setFixedTime(new Date('2026-09-14T04:00:00Z'));
        await page.route('https://**/*', route => route.abort());
        await page.addInitScript(({ theme, roster }) => {
          if (!localStorage.getItem('escrew.theme-preference.v1')) localStorage.setItem('escrew.theme-preference.v1', theme);
          localStorage.setItem('pwaplog.aims-roster.v1', JSON.stringify(roster));
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.style.setProperty('--safe-area-top', '59px');
            document.documentElement.style.setProperty('--safe-area-bottom', '34px');
          });
        }, { theme, roster });
        try {
          await page.goto(origin);
          await page.waitForSelector('.home-hero');
          await seedDb(page);
          await page.reload();
          await page.waitForSelector('.home-report-countdown');
          const headers = [];
          for (let i = 0; i < 5; i++) {
            await select(page, i);
            const metrics = await checkDock(page, i, key + '-' + names[i]);
            headers.push(metrics.header);
            if (i === 2) {
              await page.waitForSelector('.pay-result');
              const overflows = await page.locator('.pay-setup label').evaluateAll(nodes => nodes.filter(n=>n.scrollWidth>n.clientWidth+1).length);
              assert.equal(overflows, 0, key + ': Pay row overflow');
            }
            await screenshot(page, key + '-' + names[i], theme, engine === 'webkit' && viewport.width === 390);
          }
          assert.ok(headers.every(h=>h === headers[0]), key + ': unequal header heights');
          // All entries of both green status categories and flight cards use different semantic fills.
          const colors = await page.evaluate(() => {
            const style = sel => getComputedStyle(document.querySelector(sel));
            return ['.roster-timeline-card--flight','.roster-timeline__day--off .roster-timeline-card--activity','.roster-timeline__day--doff .roster-timeline-card--activity'].map(sel=>style(sel).backgroundColor);
          });
          assert.equal(new Set(colors).size, 3, key + ': status fills lost their distinction');

          await select(page, 1);
          await page.locator('.primary-tab-header__aims').click();
          await page.waitForSelector('.aims-import-sheet');
          await checkReachable(page, '.aims-import-sheet__cancel', key + '-AIMS');
          await screenshot(page, key + '-AIMS', theme, engine === 'webkit' && viewport.width === 390);
          await page.locator('.aims-import-sheet__cancel').click();
          assert.equal(await page.locator('#root').evaluate(el=>el.inert), false);

          await page.locator('.roster-timeline-card--flight').first().click();
          await page.waitForSelector('.flight-detail-tabs');
          for (const tab of ['Times', 'Crew', 'Aircraft', 'Notes']) {
            await page.getByRole('tab', { name: tab, exact: true }).click();
            const fits = await page.locator('.flight-detail-page').evaluate(el => el.scrollWidth <= el.clientWidth + 1);
            assert.equal(fits, true, key + ': flight detail overflow in ' + tab);
          }
          await screenshot(page, key + '-flight', theme, engine === 'webkit' && viewport.width === 390);
          await page.locator('.tab-dock__item').nth(2).click();
          await select(page, 2);
          await checkReachable(page, '.pay-setup > button', key + '-Pay-save');
          await select(page, 3);
          await page.locator('a[href="/logbook/new"]').click();
          await page.waitForSelector('.entry-form');
          await checkReachable(page, '.entry-form__actions .primary-action', key + '-editor');
          await screenshot(page, key + '-editor', theme, engine === 'webkit' && viewport.width === 390);
          await page.locator('.tab-dock__item').nth(3).click();
          await page.locator('a[href="/import/logbook"]').click();
          await page.locator('input[accept="application/pdf,.pdf"]').setInputFiles({ name: 'synthetic-visual-check.pdf', mimeType: 'application/pdf', buffer: syntheticPdf() });
          await page.waitForSelector('.pdf-candidate');
          await checkReachable(page, '.pdf-review-actions .primary-action', key + '-review', false);
          await screenshot(page, key + '-review', theme, engine === 'webkit' && viewport.width === 390);
          await page.locator('.pdf-candidate__edit-toggle').first().click();
          await page.locator('.review-field input').first().focus();
          await checkReachable(page, '.pdf-review-actions .primary-action', key + '-review-edit', false);
          assert.equal(runtimeErrors.length, 0, key + ': runtime errors: ' + runtimeErrors.join('; '));
          console.log('PASS ' + key + ': five aligned tabs, equal headers, Pay, AIMS, flight detail, editor, PDF review');
        } catch (error) {
          errors.push(key + ': ' + error.message);
          console.log('FAIL ' + errors.at(-1));
          console.log('PAGE_ERRORS ' + JSON.stringify(runtimeErrors));
          console.log('PAGE_BODY ' + (await page.locator('body').innerText()).slice(0, 2000));
          const failure = await page.screenshot({ type: 'jpeg', quality: 60 });
          console.log('VISUAL_FAILURE ' + key + ' ' + failure.toString('base64'));
          await screenshot(page, key + '-failure', theme, engine === 'webkit' && viewport.width === 390).catch(()=>{});
          if (!await page.locator('.app-frame').count()) throw new Error('Application did not start; stop repeated empty-screen checks.');
        } finally { await context.close(); }
      }
    }
    await browser.close();
  }
  // Theme preference persistence and system theme changes, without importing anything.
  const browser = await webkit.launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const page = await context.newPage();
  await page.goto(origin); await page.waitForSelector('.app-frame--dark');
  await select(page, 4);
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  assert.equal(await page.locator('html').evaluate(n=>n.classList.contains('theme-dark')), false);
  await page.reload(); await page.waitForSelector('.home-hero');
  assert.equal(await page.locator('html').evaluate(n=>n.classList.contains('theme-dark')), false);
  await select(page, 4);
  await page.getByRole('radio', { name: 'System', exact: true }).click();
  await page.waitForSelector('.app-frame--dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.waitForFunction(()=>!document.documentElement.classList.contains('theme-dark'));
  console.log('PASS theme preference: saved override, reload, live system changes');
  await context.close();
  // Contact sheets use only synthetic fixtures, making the actual WebKit renders reviewable in CI.
  for (const theme of ['light','dark']) {
    const contact = await browser.newPage({ viewport: { width: 1170, height: Math.ceil(captures[theme].length / 3) * 454 } });
    await contact.setContent('<html><body style="margin:0;background:#354458;color:white;font:13px system-ui;display:grid;grid-template-columns:repeat(3,390px)">' + captures[theme].map(c=>'<figure style="margin:0;height:454px;overflow:hidden"><figcaption style="height:22px">' + c.key + '</figcaption><img style="width:390px;height:432px;object-fit:contain;object-position:top" src="data:image/jpeg;base64,' + c.image + '"></figure>').join('') + '</body></html>');
    await contact.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(n=>n.decode())));
    const buffer = await contact.screenshot({ path: output + '/contact-' + theme + '.jpeg', type: 'jpeg', quality: 70 });
    console.log('VISUAL_IMAGE ' + theme + ' ' + buffer.toString('base64'));
    await contact.close();
  }
  await browser.close();
  await writeFile(output + '/results.json', JSON.stringify({ errors }, null, 2));
  assert.equal(errors.length, 0, errors.join('\n'));
} finally { server.kill('SIGTERM'); }
