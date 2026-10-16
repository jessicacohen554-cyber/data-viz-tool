#!/usr/bin/env node
/**
 * Playwright smoke test against the BUILT app (`dist/`) served by
 * `tools/launcher.py` (shard S6 acceptance). Not part of `npm test`: it needs
 * a built `dist/`, Python and the pre-installed Chromium; run it by hand:
 *
 *   npm run build && node tests/e2e/smoke.mjs
 *
 * Environment: `E2E_BASE_URL` (skip starting the launcher and test that URL),
 * `E2E_PORT` (launcher port, default 8771), `PLAYWRIGHT_MODULE` (path of a
 * `playwright` package when it is not resolvable; the global install under
 * `npm root -g` is tried automatically), `CHROMIUM` (browser executable;
 * default: Playwright's own lookup under `PLAYWRIGHT_BROWSERS_PATH`),
 * `E2E_SHOTS` (directory for screenshots; default `tests/e2e/shots`),
 * `E2E_HEADED=1` (show the browser).
 *
 * Scenarios (desktop 1280×800, then phone 390×844 with touch):
 *   1. load → the dataset picker opens → pick the 2024 hourly file → fields appear,
 *      the raw-rows text table shows, no console errors.
 *   2. drop `zone` on Columns and `price_usd_mwh` on Rows with synthetic pointer
 *      events (desktop: mouse drag; phone: tap field → tap shelf) → a bar chart
 *      renders on a canvas.
 *   3. add `timestamp` → switch bar → line → heatmap → treemap through Show Me;
 *      a canvas with a non-empty raster after each switch.
 *   4. hash round-trip: open the current URL in a new page → same chart type,
 *      same pills, canvas rendered.
 *   5. export menu lists PNG / CSV / JSON; saved views dialog saves a view.
 * Timings printed at the end feed `docs/records/s6/RESULT-perf-*.md`.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT ?? 8771);
const SHOTS = process.env.E2E_SHOTS ?? path.join(ROOT, 'tests/e2e/shots');
const DATASET = 'ercot-system-hourly-2024';
const TIMEOUT = 60_000;

/** Resolve the playwright package: local, then `PLAYWRIGHT_MODULE`, then the global npm root. */
async function loadPlaywright() {
  const candidates = ['playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean);
  try { candidates.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch { /* no npm */ }
  const require = createRequire(import.meta.url);
  for (const c of candidates) {
    try { return require(c); } catch { /* try the next one */ }
  }
  throw new Error(`playwright not found; tried ${candidates.join(', ')} — set PLAYWRIGHT_MODULE`);
}

/** Start the launcher and wait until it answers. */
async function startServer() {
  if (process.env.E2E_BASE_URL) return { base: process.env.E2E_BASE_URL, stop: () => {} };
  const proc = spawn('python3', ['tools/launcher.py', '--no-browser', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${PORT}/`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    try {
      const res = await fetch(base);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) { proc.kill(); throw new Error('launcher did not start'); }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { base, stop: () => proc.kill() };
}

class Failure extends Error {}
function assert(cond, msg) { if (!cond) throw new Failure(msg); }

const timings = [];
function mark(label, ms) { timings.push({ label, ms: Math.round(ms) }); }

/** Centre of an element's bounding box. */
async function centre(locator) {
  const box = await locator.boundingBox();
  assert(box, `no box for ${locator}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/**
 * Synthetic pointer drag: dispatches PointerEvents on the source element
 * (where the controller listens) with coordinates walking to the target. The
 * controller starts a mouse drag after 8 px and a touch drag after a 180 ms press.
 */
async function pointerDrag(page, source, target, pointerType = 'mouse') {
  const from = await centre(source);
  const to = await centre(target);
  await source.evaluate(async (el, { from, to, pointerType }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType, isPrimary: true,
      clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
    fire('pointerdown', from.x, from.y);
    if (pointerType === 'touch') await sleep(260);
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      fire('pointermove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
      await sleep(16);
    }
    fire('pointerup', to.x, to.y);
  }, { from, to, pointerType });
}

/** Synthetic tap (pointerdown + pointerup on the same spot) on an element. */
async function pointerTap(page, locator, pointerType = 'touch') {
  const at = await centre(locator);
  await locator.evaluate((el, { at, pointerType }) => {
    for (const type of ['pointerdown', 'pointerup']) {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType, isPrimary: true,
        clientX: at.x, clientY: at.y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
      }));
    }
  }, { at, pointerType });
}

/** The rendered chart canvas, waiting until ECharts has painted something. */
async function expectCanvas(page, label) {
  const canvas = page.locator('.chart-canvas canvas').first();
  await canvas.waitFor({ state: 'visible', timeout: TIMEOUT });
  const painted = await page.waitForFunction(() => {
    const c = document.querySelector('.chart-canvas canvas');
    if (!c || c.width === 0) return false;
    const ctx = c.getContext('2d');
    if (!ctx) return true; // ECharts holds the context; a sized canvas is the best signal we get
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let nonWhite = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i + 3] > 0 && (d[i] < 250 || d[i + 1] < 250 || d[i + 2] < 250)) nonWhite++;
    return nonWhite > 20;
  }, undefined, { timeout: TIMEOUT });
  assert(painted, `${label}: canvas never painted`);
  const box = await canvas.boundingBox();
  assert(box && box.width > 100 && box.height > 100, `${label}: canvas too small (${JSON.stringify(box)})`);
}

/** Field names on a shelf, in order. */
async function pillsOn(page, shelf, scope = page) {
  return scope.locator(`[data-shelf="${shelf}"] .pill .pill__label`).allTextContents();
}

async function chartTypeOf(page) {
  return page.evaluate(() => {
    const h = location.hash;
    return h; // the label in the header is the readable check; the hash is the exact one
  });
}

async function currentSpec(page) {
  // Read the spec back through the URL codec the app uses (window-level helpers are not exposed, so decode here).
  const hash = await page.evaluate(() => location.hash);
  const m = /^#(v|j)=(.+)$/.exec(hash);
  assert(m, `hash is not a spec: ${hash.slice(0, 40)}`);
  const b64 = m[2].replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (m[2].length % 4)) % 4);
  let bytes = Buffer.from(b64, 'base64');
  if (m[1] === 'v') {
    const { inflateRawSync } = await import('node:zlib');
    bytes = inflateRawSync(bytes);
  }
  return JSON.parse(bytes.toString('utf8'));
}

async function pickChart(page, label, viewport) {
  if (viewport === 'phone') {
    await page.getByRole('button', { name: 'Chart', exact: true }).click();
  } else if (!(await page.locator('.chart-showme').count())) {
    await page.getByRole('button', { name: 'Show Me' }).click();
  }
  const item = page.locator(`.picker__item[title="${label}"]`);
  await item.waitFor({ state: 'visible', timeout: TIMEOUT });
  const t0 = Date.now();
  await item.click();
  await expectCanvas(page, label);
  mark(`${viewport}: switch to ${label} → painted`, Date.now() - t0);
  if (viewport === 'phone') await page.locator('.sheet').waitFor({ state: 'hidden', timeout: TIMEOUT }).catch(() => {});
}

async function scenario(browser, base, viewport) {
  const phone = viewport === 'phone';
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));

  // 1. Load → picker → fields.
  const t0 = Date.now();
  await page.goto(base, { waitUntil: 'load' });
  const picker = page.getByRole('dialog', { name: 'Open a dataset' });
  await picker.waitFor({ state: 'visible', timeout: TIMEOUT });
  mark(`${viewport}: page load → picker open`, Date.now() - t0);
  const card = picker.locator('.dcard', { hasText: 'Ercot System Hourly 2024' }).first();
  await card.waitFor({ state: 'visible', timeout: TIMEOUT });
  const t1 = Date.now();
  await card.click();
  await picker.waitFor({ state: 'hidden', timeout: TIMEOUT });
  mark(`${viewport}: pick 2024 file → loaded (picker closed)`, Date.now() - t1);
  await page.screenshot({ path: path.join(SHOTS, `${viewport}-1-loaded.png`) });

  if (phone) {
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await page.locator('.sheet [data-field="zone"]').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.screenshot({ path: path.join(SHOTS, `${viewport}-2-data-sheet.png`) });
  } else {
    await page.locator('.pane--fields [data-field="zone"]').waitFor({ state: 'visible', timeout: TIMEOUT });
    // Raw rows preview for the empty text-table worksheet.
    await page.locator('.chart-canvas .text-table tbody tr').first().waitFor({ state: 'visible', timeout: TIMEOUT });
  }

  // 2. Drop zone → Columns, price → Rows.
  const t2 = Date.now();
  if (phone) {
    // Tap-to-place: tap the field (switches to the Shelves sheet armed), then tap the shelf.
    await pointerTap(page, page.locator('.sheet [data-field="zone"]'));
    const columns = page.locator('.sheet [data-shelf="columns"]');
    await columns.waitFor({ state: 'visible', timeout: TIMEOUT });
    await pointerTap(page, columns.locator('.shelf__label'));
    await page.locator('.sheet [data-shelf="columns"] .pill').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('.sheet .sheet__close').click();
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await pointerTap(page, page.locator('.sheet [data-field="price_usd_mwh"]'));
    const rows = page.locator('.sheet [data-shelf="rows"]');
    await rows.waitFor({ state: 'visible', timeout: TIMEOUT });
    await pointerTap(page, rows.locator('.shelf__label'));
    await page.locator('.sheet [data-shelf="rows"] .pill').waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.screenshot({ path: path.join(SHOTS, `${viewport}-3-shelves-sheet.png`) });
    assert((await pillsOn(page, 'columns', page.locator('.sheet'))).join() === 'zone', 'phone: zone not on Columns');
    assert((await pillsOn(page, 'rows', page.locator('.sheet'))).join() === 'SUM(price_usd_mwh)', 'phone: price not on Rows');
    await page.locator('.sheet .sheet__close').click();
  } else {
    const fields = page.locator('.pane--fields');
    const shelves = page.locator('.pane--shelves');
    await pointerDrag(page, fields.locator('[data-field="zone"]'), shelves.locator('[data-shelf="columns"]'));
    await page.locator('.pane--shelves [data-shelf="columns"] .pill').waitFor({ state: 'visible', timeout: TIMEOUT });
    await pointerDrag(page, fields.locator('[data-field="price_usd_mwh"]'), shelves.locator('[data-shelf="rows"]'));
    await page.locator('.pane--shelves [data-shelf="rows"] .pill').waitFor({ state: 'visible', timeout: TIMEOUT });
    assert((await pillsOn(page, 'columns', shelves)).join() === 'zone', 'desktop: zone not on Columns');
    assert((await pillsOn(page, 'rows', shelves)).join() === 'SUM(price_usd_mwh)', 'desktop: price not on Rows');
  }
  await expectCanvas(page, 'bar');
  mark(`${viewport}: two drops → bar painted`, Date.now() - t2);
  await page.waitForTimeout(400); // hash debounce
  let s = await currentSpec(page);
  assert(s.chartType === 'bar', `expected bar after the drops, got ${s.chartType}`);
  await page.screenshot({ path: path.join(SHOTS, `${viewport}-4-bar.png`) });

  // 3. Add timestamp (heatmap needs two dimensions), then bar → line → heatmap → treemap.
  if (phone) {
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await pointerTap(page, page.locator('.sheet [data-field="timestamp"]'));
    const rows = page.locator('.sheet [data-shelf="rows"]');
    await rows.waitFor({ state: 'visible', timeout: TIMEOUT });
    await pointerTap(page, rows.locator('.shelf__label'));
    await page.locator('.sheet [data-shelf="rows"] .pill').nth(1).waitFor({ state: 'visible', timeout: TIMEOUT });
    await page.locator('.sheet .sheet__close').click();
  } else {
    await pointerDrag(page, page.locator('.pane--fields [data-field="timestamp"]'), page.locator('.pane--shelves [data-shelf="rows"]'));
    await page.locator('.pane--shelves [data-shelf="rows"] .pill').nth(1).waitFor({ state: 'visible', timeout: TIMEOUT });
  }
  for (const label of ['Line', 'Heatmap', 'Treemap']) {
    await pickChart(page, label, viewport);
    await page.screenshot({ path: path.join(SHOTS, `${viewport}-5-${label.toLowerCase()}.png`) });
  }
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.chartType === 'treemap', `expected treemap, got ${s.chartType}`);
  assert(s.datasetId === DATASET, `spec names ${s.datasetId}`);

  // 4. Hash round-trip in a fresh page.
  const url = page.url();
  const page2 = await context.newPage();
  page2.on('pageerror', (err) => errors.push(`pageerror(2): ${err.message}`));
  const t3 = Date.now();
  await page2.goto(url, { waitUntil: 'load' });
  await expectCanvas(page2, 'round-trip');
  mark(`${viewport}: hash restore → treemap painted`, Date.now() - t3);
  const s2 = await currentSpec(page2);
  assert(s2.chartType === s.chartType, 'round-trip chart type differs');
  const fieldsOf = (x) => Object.values(x.shelves).flat().map((p) => p.field).sort().join();
  assert(fieldsOf(s2) === fieldsOf(s), `round-trip pills differ: ${fieldsOf(s2)} vs ${fieldsOf(s)}`);
  assert((await page2.getByRole('dialog', { name: 'Open a dataset' }).count()) === 0, 'picker opened on a hash restore');
  await page2.screenshot({ path: path.join(SHOTS, `${viewport}-6-roundtrip.png`) });
  await page2.close();

  // 5. Export menu and saved views.
  await page.getByRole('button', { name: 'Export' }).click();
  const menu = page.getByRole('menu', { name: 'Export' });
  await menu.waitFor({ state: 'visible', timeout: TIMEOUT });
  for (const item of ['Chart as PNG', 'Table as CSV', 'View as JSON']) {
    assert(await menu.getByRole('menuitem', { name: item }).isEnabled(), `${item} disabled`);
  }
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: TIMEOUT }),
    menu.getByRole('menuitem', { name: 'Table as CSV' }).click(),
  ]);
  assert(download.suggestedFilename().endsWith('.csv'), `csv download named ${download.suggestedFilename()}`);
  await page.getByRole('button', { name: 'Views' }).click();
  const viewsDlg = page.getByRole('dialog', { name: 'Saved views' });
  await viewsDlg.waitFor({ state: 'visible', timeout: TIMEOUT });
  await viewsDlg.getByLabel('View name').fill('smoke view');
  await viewsDlg.getByRole('button', { name: 'Save current' }).click();
  await viewsDlg.locator('.view__name', { hasText: 'smoke view' }).waitFor({ state: 'visible', timeout: TIMEOUT });
  await page.screenshot({ path: path.join(SHOTS, `${viewport}-7-views.png`) });
  await viewsDlg.getByRole('button', { name: 'Done' }).click();

  await context.close();
  const real = errors.filter((e) => !/favicon|ERR_INTERNET_DISCONNECTED|fonts\.g(oogleapis|static)\.com/.test(e));
  assert(real.length === 0, `${viewport}: console errors:\n  ${real.join('\n  ')}`);
}

async function main() {
  const { chromium } = await loadPlaywright();
  await mkdir(SHOTS, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({
    headless: !process.env.E2E_HEADED,
    ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
  });
  const results = [];
  try {
    for (const viewport of ['desktop', 'phone']) {
      try {
        await scenario(browser, server.base, viewport);
        results.push(`PASS ${viewport}`);
      } catch (e) {
        results.push(`FAIL ${viewport}: ${e instanceof Error ? e.message : String(e)}`);
        if (!(e instanceof Failure)) console.error(e);
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  console.log('\nTimings (ms):');
  for (const t of timings) console.log(`  ${String(t.ms).padStart(6)}  ${t.label}`);
  console.log('\n' + results.join('\n'));
  if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
