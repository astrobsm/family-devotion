// End-to-end check in real headless Chrome at phone size, over the DevTools
// protocol (no dependencies; needs Node 22+ and Chrome or Edge installed).
//   node tools/test-browser.mjs [screenshot-dir]
//   BASE_URL=https://example.org/app/ node tools/test-browser.mjs
// Checks: every view renders with no console errors; "mark as prayed"
// survives a reload; after one online visit the app works fully offline,
// including deep links. Exits non-zero on any failure.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });
const PORT = 8765, DBG = 9333;
const browsers = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const exe = browsers.find(existsSync);
if (!exe) { console.error('No Chrome/Edge found'); process.exit(2); }

// BASE_URL=https://... tests a deployed copy instead of a local server.
const remote = process.env.BASE_URL;
const server = remote ? null : spawn(process.execPath, [join(ROOT, 'tools', 'serve.mjs'), String(PORT)], { stdio: 'ignore' });
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'fd-chrome-'))}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function main() {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${DBG}/json`)).json(); } catch { await sleep(200); }
  }
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); })
    .then((m) => { if (m.error) throw new Error(`${method}: ${m.error.message}`); return m.result; });
  const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const go = async (hash) => { await evaluate(`location.hash = ${JSON.stringify(hash)}`); await sleep(150); };
  const shot = async (name) => {
    if (!shots) return;
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(shots, name + '.png'), Buffer.from(data, 'base64'));
  };

  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true });
  // Pin the clock to a known day in the manual: Wednesday 18 Nov 2026, 07:00.
  // (Shift Date by a fixed offset so the clock still ticks.)
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const R = Date, shift = new R(2026, 10, 18, 7, 0).getTime() - R.now();
    class D extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + shift); } static now() { return R.now() + shift; } }
    globalThis.Date = D;
  })();` });

  const base = remote ? remote.replace(/\/?$/, '/') : `http://localhost:${PORT}/`;
  await send('Page.navigate', { url: base });
  await sleep(1500);

  ok(await evaluate(`document.querySelector('.hero h1')?.textContent`) === 'Diligence', 'Today shows week 1 virtue (Diligence)');
  ok(await evaluate(`document.querySelector('.hero .eyebrow')?.textContent.includes('Wednesday 18 November')`), 'Today shows the pinned date');
  ok(await evaluate(`!!document.querySelector('.dev-card.morning.now')`), 'Morning devotion is highlighted at 07:00');
  await shot('1-today');

  await go('#/d/2026-11-18/morning');
  ok(await evaluate(`document.querySelector('.leader b')?.textContent`) === 'Chimdalu, with Mum', 'Wednesday morning leader is Chimdalu, with Mum');
  ok(await evaluate(`document.querySelectorAll('.reader details.pr').length >= 8`), 'Recitation prayers are tappable');
  ok(await evaluate(`[...document.querySelectorAll('.sec-title')].some(e => e.textContent === 'Jesus the Carpenter')`), 'Story title renders');
  await evaluate(`document.querySelector('details.pr').open = true`);
  await shot('2-devotion');

  await go('#/d/2026-11-18/night');
  ok(await evaluate(`[...document.querySelectorAll('details.fold summary')].some(e => e.textContent.includes('challenges'))`), 'Wednesday night inlines the week’s challenges');
  await go('#/d/2026-11-15/night');
  ok(await evaluate(`document.body.textContent.includes('The Two Yam Barns')`), 'Sunday night inlines the Family Gathering story');
  ok(await evaluate(`!!document.querySelector('[data-timer]')`), 'Examination of conscience has a silence timer');

  // mark as prayed, then reload
  await go('#/d/2026-11-18/morning');
  await evaluate(`document.querySelector('[data-done]').click()`);
  await send('Page.reload'); await sleep(1200);
  ok(await evaluate(`document.querySelector('[data-done]')?.classList.contains('done')`), '“Prayed” is remembered after reload');

  await go('#/week'); await shot('3-week');
  ok(await evaluate(`document.querySelectorAll('.daylist li').length`) === 7, 'Week view lists 7 days');
  await go('#/year');
  ok(await evaluate(`document.querySelectorAll('#results .wk').length`) === 59, 'All 59 weeks listed');
  await evaluate(`(() => { const q = document.getElementById('q'); q.value = 'noah'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  ok(await evaluate(`document.getElementById('results').textContent.includes('Noah')`), 'Search finds “Noah”');
  await shot('4-search');
  await go('#/prayers'); await shot('5-prayers');
  ok(await evaluate(`document.body.textContent.includes('Hail, holy Queen, Mother of mercy')`), 'Prayers page has full texts');
  await go('#/more');
  await evaluate(`document.querySelector('[data-set="theme"][data-val="dark"]').click()`);
  await sleep(100); await shot('6-settings-dark');
  ok(await evaluate(`document.documentElement.dataset.theme`) === 'dark', 'Dark theme applies');
  await go('#/d/2027-12-31/night'); await shot('7-last-night-dark');
  ok(await evaluate(`document.body.textContent.includes('Year-end thanksgiving')`), 'Last devotion of the year renders');

  // walk every devotion to catch render errors in rare layouts
  const n = await evaluate(`(async () => { let n = 0; for (const w of MANUAL.weeks) for (const d of w.days) for (const k of ['morning','night']) { location.hash = '#/d/' + d.date + '/' + k; await new Promise(r => setTimeout(r, 0)); if (document.querySelector('.reader-head')) n++; } return n; })()`);
  ok(n === 824, `All 824 devotions render (${n})`);
  for (let w = 1; w <= 59; w++) await go(`#/week/${w}`);

  // offline: service worker must be controlling the page
  const ready = await evaluate(`Promise.race([navigator.serviceWorker.ready.then(r => !!r.active), new Promise(r => setTimeout(() => r(false), 8000))])`);
  ok(ready, 'Service worker is active');
  await send('Page.reload'); await sleep(1000);
  ok(await evaluate(`!!navigator.serviceWorker.controller`), 'Page is controlled by the service worker');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.navigate', { url: base + '#/d/2027-04-04/morning' }); await sleep(1500);
  ok(await evaluate(`!!document.querySelector('.reader-head h1')`), 'Offline: deep link to a devotion loads');
  await send('Page.navigate', { url: base + '?fresh=1#/prayers' }); await sleep(1200);
  ok(await evaluate(`document.body.textContent.includes('Apostles’ Creed')`), 'Offline: a fresh navigation still loads the app');
  await shot('8-offline-prayers');

  ok(errors.length === 0, `No console errors${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`);
  ws.close();
}

main().catch((e) => { console.error(e); failures++; }).finally(() => {
  chrome.kill(); server?.kill();
  console.log(failures ? `\n${failures} failure(s)` : '\nall passed');
  process.exit(failures ? 1 : 0);
});
