#!/usr/bin/env node
/**
 * In-browser performance probe on the 430K-row ERCOT file (docs/ARCHITECTURE.md
 * §9 budgets, rule R-PERF). Companion to `tests/perf/engine-430k.test.ts`, which
 * measures the engine in Node; this one measures what the user sees in the
 * built app served by `tools/launcher.py`, through the pre-installed Chromium:
 *
 *   - shell paint: first-contentful-paint and largest-contentful-paint of the
 *     empty worksheet, plus the sum of long tasks (a total-blocking-time proxy;
 *     Lighthouse is not installed in the shard container);
 *   - open the 2019–2025 hourly file from the picker: wall time from the card
 *     click to the picker closing (download + parse + build in the worker);
 *   - pill drop → chart painted: `weekday` on Columns, `price_usd_mwh` on Rows
 *     (a bar; `zone` carries a geo role since v2, so it would open as a map and
 *     time the layer fetch instead of the re-render);
 *   - 3-dim group-by: add YEAR(timestamp) and zone (7 × 7 × 7 = 343 groups),
 *     read the worker's `elapsedMs` from the footer and the wall time to the repaint.
 *
 * Runs desktop (1280×800) and phone (390×844, touch, 4× CPU throttle to stand
 * in for a mid-range handset). Same environment variables as `smoke.mjs`.
 *
 *   npm run build && node tests/e2e/perf-430k.mjs
 */
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.E2E_PORT ?? 8773);
const BIG = 'Ercot System Hourly 2019-2025';
const TIMEOUT = 180_000;
/** CPU slowdown applied to the phone run (Chrome DevTools "4x slowdown" ≈ a mid-range phone). */
const PHONE_CPU_SLOWDOWN = 4;

async function loadPlaywright() {
  const candidates = ['playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean);
  try { candidates.push(path.join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'playwright')); } catch { /* no npm */ }
  const require = createRequire(import.meta.url);
  for (const c of candidates) { try { return require(c); } catch { /* next */ } }
  throw new Error('playwright not found — set PLAYWRIGHT_MODULE');
}

async function startServer() {
  if (process.env.E2E_BASE_URL) return { base: process.env.E2E_BASE_URL, stop: () => {} };
  const proc = spawn('python3', ['tools/launcher.py', '--no-browser', '--port', String(PORT)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const base = `http://127.0.0.1:${PORT}/`;
  const deadline = Date.now() + 20_000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch { /* not up */ }
    if (Date.now() > deadline) { proc.kill(); throw new Error('launcher did not start'); }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { base, stop: () => proc.kill() };
}

async function centre(locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element has no box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function pointerDrag(source, target) {
  const from = await centre(source);
  const to = await centre(target);
  await source.evaluate(async (el, { from, to }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: 7, pointerType: 'mouse', isPrimary: true,
      clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1,
    }));
    fire('pointerdown', from.x, from.y);
    for (let i = 1; i <= 10; i++) { fire('pointermove', from.x + ((to.x - from.x) * i) / 10, from.y + ((to.y - from.y) * i) / 10); await sleep(8); }
    fire('pointerup', to.x, to.y);
  }, { from, to });
}

/** Wait until the footer reports a result whose group count differs from `notGroups` and the canvas has painted. */
async function waitForRepaint(page, notGroups) {
  await page.waitForFunction((prev) => {
    const foot = document.querySelector('.chart-foot');
    const m = foot && /^([\d,]+) groups?/.exec(foot.textContent.replace(/\s+/g, ' ').trim());
    const c = document.querySelector('.chart-canvas canvas');
    return m && m[1] !== prev && c && c.width > 0 && !document.querySelector('.chart-canvas--busy');
  }, notGroups, { timeout: TIMEOUT });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function footer(page) {
  const text = (await page.locator('.chart-foot').textContent()).replace(/\s+/g, ' ').trim();
  const m = /^([\d,]+) groups? · ([\d,]+) of ([\d,]+) rows · (\d+) ms/.exec(text);
  if (!m) throw new Error(`unexpected footer: ${text}`);
  return { groups: m[1], filtered: m[2], scanned: m[3], elapsedMs: Number(m[4]) };
}

/** Synthetic touch tap. */
async function pointerTap(locator) {
  const at = await centre(locator);
  await locator.evaluate((el, at) => {
    for (const type of ['pointerdown', 'pointerup']) {
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 9, pointerType: 'touch', isPrimary: true, clientX: at.x, clientY: at.y, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    }
  }, at);
}

/**
 * Put `field` on `shelf` through the phone sheets (tap field → tap shelf) or a desktop drag.
 * Resolves with the wall-clock time of the drop gesture's pointer-up, so "drop → re-render" excludes
 * the gesture itself; on phones the Shelves sheet is left open (the chart repaints beneath it).
 */
async function place(page, phone, field, shelf) {
  if (phone) {
    if (await page.locator('.sheet').count()) {
      await page.locator('.sheet .sheet__close').click();
      await page.locator('.sheet').waitFor({ state: 'hidden', timeout: TIMEOUT });
    }
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await pointerTap(page.locator(`.sheet [data-field="${field}"]`));
    const zone = page.locator(`.sheet [data-shelf="${shelf}"]`);
    await zone.waitFor({ state: 'visible', timeout: TIMEOUT });
    await pointerTap(zone.locator('.shelf__label'));
    return Date.now();
  }
  await pointerDrag(page.locator(`.pane--fields [data-field="${field}"]`), page.locator(`.pane--shelves [data-shelf="${shelf}"]`));
  return Date.now();
}

async function run(browser, base, viewport) {
  const phone = viewport === 'phone';
  const context = await browser.newContext(phone
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (phone) await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE_CPU_SLOWDOWN });
  const out = { viewport, cpuSlowdown: phone ? PHONE_CPU_SLOWDOWN : 1 };

  // Shell paint metrics on the empty worksheet (the picker opens on boot; the shell behind it is what paints).
  await page.addInitScript(() => {
    window.__perf = { lcp: 0, longTasks: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.longTasks += Math.max(0, e.duration - 50); }).observe({ type: 'longtask', buffered: true });
  });
  await page.goto(base, { waitUntil: 'load' });
  const picker = page.getByRole('dialog', { name: 'Open a dataset' });
  await picker.waitFor({ state: 'visible', timeout: TIMEOUT });
  await page.waitForTimeout(1500);
  Object.assign(out, await page.evaluate(() => {
    const paint = Object.fromEntries(performance.getEntriesByType('paint').map((p) => [p.name, Math.round(p.startTime)]));
    const nav = performance.getEntriesByType('navigation')[0];
    return {
      fcpMs: paint['first-contentful-paint'] ?? null,
      lcpMs: Math.round(window.__perf.lcp),
      domContentLoadedMs: Math.round(nav?.domContentLoadedEventEnd ?? 0),
      loadEventMs: Math.round(nav?.loadEventEnd ?? 0),
      blockingMs: Math.round(window.__perf.longTasks),
      jsBytes: performance.getEntriesByType('resource').filter((r) => r.name.endsWith('.js')).reduce((n, r) => n + (r.transferSize || 0), 0),
    };
  }));

  // Open the 430K-row file.
  const card = picker.locator('.dcard', { hasText: BIG }).first();
  const t0 = Date.now();
  await card.click();
  await picker.waitFor({ state: 'hidden', timeout: TIMEOUT });
  out.loadMs = Date.now() - t0;
  out.rowsLoaded = (await page.locator('.pane__stat').first().textContent().catch(() => '')).trim();

  // Drop weekday → Columns, price → Rows (desktop: pointer drag; phone: tap field → tap shelf through the sheets).
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const t1 = Date.now();
  await place(page, phone, 'weekday', 'columns');
  const dropped = await place(page, phone, 'price_usd_mwh', 'rows');
  await waitForRepaint(page, '');
  out.twoDropsWallMs = Date.now() - t1;
  out.secondDropToBarMs = Date.now() - dropped;
  out.bar = await footer(page);

  // 3-dim group-by: weekday × YEAR(timestamp) × zone on Columns (343 groups), one more drop each.
  const dropped2 = await place(page, phone, 'timestamp', 'columns');
  await waitForRepaint(page, out.bar.groups);
  out.thirdPillDropToRepaintMs = Date.now() - dropped2;
  const twoDim = await footer(page);
  const dropped3 = await place(page, phone, 'zone', 'columns');
  await waitForRepaint(page, twoDim.groups);
  out.fourthPillDropToRepaintMs = Date.now() - dropped3;
  out.twoDim = twoDim;
  out.threeDim = await footer(page);
  out.consoleErrors = errors.filter((e) => !/fonts\.g(oogleapis|static)|ERR_INTERNET_DISCONNECTED/.test(e));
  await context.close();
  return out;
}

async function main() {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ headless: !process.env.E2E_HEADED, ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
  const results = [];
  try {
    for (const viewport of ['desktop', 'phone']) {
      try { results.push(await run(browser, server.base, viewport)); }
      catch (e) { results.push({ viewport, error: e instanceof Error ? e.message : String(e) }); }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  console.log(JSON.stringify(results, null, 2));
  if (results.some((r) => r.error)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
