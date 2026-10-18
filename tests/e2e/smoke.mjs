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
 * `E2E_HEADED=1` (show the browser), `E2E_VIEWPORTS` (`desktop`, `phone` or
 * both, comma-separated; default both).
 *
 * Scenarios (desktop 1280×800, then phone 390×844 with touch):
 *   1. load → the dataset picker opens → pick the 2024 hourly file → fields appear,
 *      the raw-rows text table shows, no console errors.
 *   2. drop `zone` on Columns and `price_usd_mwh` on Rows with synthetic pointer
 *      events (desktop: mouse drag; phone: tap field → tap shelf) → the
 *      Automatic mark opens a filled map (zone carries the inferred ERCOT-zone
 *      role, v2) and the zones layer loads.
 *   3. add `timestamp` → switch bar → line → heatmap → treemap through Show Me;
 *      a canvas with a non-empty raster after each switch.
 *   4. hash round-trip: open the current URL in a new page → same chart type,
 *      same pills, canvas rendered.
 *   5. export menu lists PNG / CSV / JSON; saved views dialog saves a view.
 *   v2 (T6), on the same page:
 *   6. Filled map of AVG(price) by zone on the ERCOT zones layer (geo role
 *      inferred from the `zone` column); map mark → bubble → symbol → fill.
 *   7. Envelope of price by HOUR(timestamp) in percentile mode (24 groups);
 *      the P25–P75 chip toggles a band off and on.
 *   8. Combo bar + line: SUM(demand) lands on the right axis; the pill menu
 *      shows "Dual axis" and "Synchronize axis" toggles `axes.synchronized`.
 *   9. Line with an average reference line and a linear trend line.
 *  10. Style panel changes the font family; the Y-axis dialog turns gridlines off.
 *  11. Bar: a click on a mark opens the annotation editor; the note is added.
 *  12. `tests/fixtures/plants.csv` opened from the device: symbol map from
 *      inferred latitude / longitude, `fuel` on Shape with the power-gen icon
 *      set, base layer switched to the ERCOT zones.
 * Timings printed at the end feed `docs/records/t6/RESULT-perf-*.md`.
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
const PLANTS = path.join(ROOT, 'tests/fixtures/plants.csv');
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
  // The hash is written 300 ms after the last change; read it after the debounce.
  await page.waitForTimeout(400);
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
  const disabled = page.locator(`.picker__item[title^="${label} — "]`);
  await Promise.race([item.waitFor({ state: 'visible', timeout: TIMEOUT }), disabled.waitFor({ state: 'visible', timeout: TIMEOUT })]);
  if (await disabled.count()) assert(false, `${label} is not eligible: ${await disabled.first().getAttribute('title')}`);
  const t0 = Date.now();
  await item.click();
  await expectCanvas(page, label);
  mark(`${viewport}: switch to ${label} → painted`, Date.now() - t0);
  if (viewport === 'phone') await page.locator('.sheet').waitFor({ state: 'hidden', timeout: TIMEOUT }).catch(() => {});
}

// ---- v2 helpers (T6) -------------------------------------------------------

/** Two animation frames (ECharts paints on rAF after `setOption`). */
async function settle(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/**
 * The chart is in a good state: no query in flight, no hint (an eligibility
 * reason or a builder error replaces the canvas), a painted canvas. Map layers
 * load lazily, so the check also waits for the pending-layer rebuild.
 */
async function expectChart(page, label) {
  await page.waitForFunction(() => !document.querySelector('.chart-canvas--busy'), undefined, { timeout: TIMEOUT });
  await settle(page);
  const hint = page.locator('.chart-canvas__hint');
  if (await hint.count()) assert(false, `${label}: chart shows a hint instead of a canvas: ${(await hint.first().textContent()).trim()}`);
  await expectCanvas(page, label);
}

/** The result footer's group count, as a number. */
async function groupCount(page) {
  const text = (await page.locator('.chart-foot').textContent()).replace(/\s+/g, ' ').trim();
  const m = /^([\d,]+) groups?/.exec(text);
  assert(m, `unexpected footer: ${text}`);
  return Number(m[1].replace(/,/g, ''));
}

/** Wait until the footer reports `groups` result groups (the query the step caused has answered). */
async function expectGroups(page, groups, label) {
  await page.waitForFunction((g) => {
    const foot = document.querySelector('.chart-foot');
    const m = foot && /^([\d,]+) groups?/.exec(foot.textContent.replace(/\s+/g, ' ').trim());
    return m && Number(m[1].replace(/,/g, '')) === g && !document.querySelector('.chart-canvas--busy');
  }, groups, { timeout: TIMEOUT }).catch(async () => assert(false, `${label}: expected ${groups} groups, footer says ${await groupCount(page).catch(() => '?')}`));
}

/** Close any open bottom sheet (phone). */
async function closeSheet(page) {
  if (await page.locator('.sheet .sheet__close').count()) {
    await page.locator('.sheet .sheet__close').first().click();
    await page.locator('.sheet').waitFor({ state: 'hidden', timeout: TIMEOUT }).catch(() => {});
  }
}

/** Phone: open the bottom sheet `name` (Data / Shelves / Marks / Chart) and return it; desktop: return the pane holding `shelf`. */
async function shelfScope(page, phone, shelf) {
  if (!phone) return page.locator('.pane--shelves');
  await closeSheet(page);
  const sheet = shelf === 'columns' || shelf === 'rows' || shelf === 'filters' ? 'Shelves' : 'Marks';
  await page.getByRole('button', { name: sheet, exact: true }).click();
  const scope = page.locator('.sheet');
  await scope.locator(`[data-shelf="${shelf}"]`).waitFor({ state: 'visible', timeout: TIMEOUT });
  return scope;
}

/** Put `field` on `shelf` (desktop drag; phone tap field → tap shelf) and wait for the pill. */
async function place(page, phone, field, shelf) {
  const before = phone ? 0 : await page.locator(`.pane--shelves [data-shelf="${shelf}"] .pill`).count();
  if (phone) {
    await closeSheet(page);
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await pointerTap(page, page.locator(`.sheet [data-field="${field}"]`));
    // The tap arms the selection and opens the Shelves sheet; a mark shelf sits in the Marks sheet instead.
    if (!(shelf === 'columns' || shelf === 'rows' || shelf === 'filters')) {
      await page.locator('.sheet [data-shelf="columns"]').waitFor({ state: 'visible', timeout: TIMEOUT });
      await closeSheet(page);
      await page.getByRole('button', { name: 'Marks', exact: true }).click();
    }
    const zone = page.locator(`.sheet [data-shelf="${shelf}"]`);
    await zone.waitFor({ state: 'visible', timeout: TIMEOUT });
    const n = await zone.locator('.pill').count();
    await pointerTap(page, zone.locator('.shelf__label'));
    await zone.locator('.pill').nth(n).waitFor({ state: 'visible', timeout: TIMEOUT });
    await closeSheet(page);
    return;
  }
  await pointerDrag(page, page.locator(`.pane--fields [data-field="${field}"]`), page.locator(`.pane--shelves [data-shelf="${shelf}"]`));
  await page.locator(`.pane--shelves [data-shelf="${shelf}"] .pill`).nth(before).waitFor({ state: 'visible', timeout: TIMEOUT });
}

/** Open the options menu of the pill on `shelf` whose label contains `field` (a drop may land before an existing pill, so never by index). */
async function openPillMenu(page, phone, shelf, field) {
  const scope = await shelfScope(page, phone, shelf);
  const pill = scope.locator(`[data-shelf="${shelf}"] .pill`).filter({ has: page.locator('.pill__label', { hasText: field }) }).first();
  await pill.waitFor({ state: 'visible', timeout: TIMEOUT });
  await pill.locator('button[aria-label="Pill options"]').click();
  await page.locator('.menu__item').first().waitFor({ state: 'visible', timeout: TIMEOUT });
}

/** Click the menu row whose label starts with `label` (submenus drill in place). */
async function menuPick(page, label) {
  const re = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const item = page.locator('.menu__item').filter({ has: page.locator('.menu__label', { hasText: re }) }).first();
  await item.waitFor({ state: 'visible', timeout: TIMEOUT });
  await item.click();
}

/** Open the chart head's Format menu and pick `label` (opens one of the T4 dialogs; the desktop style panel is an `aside`). */
async function openFormat(page, label) {
  await page.locator('.chart-head button[aria-haspopup="menu"]').click();
  await menuPick(page, label);
  const dlg = page.locator('[role="dialog"]:visible, .style-panel').last();
  await dlg.waitFor({ state: 'visible', timeout: TIMEOUT });
  return dlg;
}

/** Close the open dialog or style panel through its ✕. */
async function closeDialog(page) {
  await page.locator('[role="dialog"]:visible .dialog__close, .style-panel .style-panel__close').last().click();
  await page.waitForFunction(() => !document.querySelector('[role="dialog"] .dialog__close, .style-panel'), undefined, { timeout: TIMEOUT }).catch(() => {});
}

/** The Marks card (desktop pane, or the phone Marks sheet). */
async function marksCard(page, phone) {
  if (!phone) return page.locator('.pane--shelves .marks');
  await closeSheet(page);
  await page.getByRole('button', { name: 'Marks', exact: true }).click();
  const m = page.locator('.sheet .marks');
  await m.waitFor({ state: 'visible', timeout: TIMEOUT });
  return m;
}

/**
 * v2 scenarios on a page that has the 2024 file loaded with `zone`, `SUM(price)`
 * and `timestamp` placed (the treemap of step 3). Each step ends with the chart
 * painted and no hint; `errors` collects console errors for the final assert.
 */
async function v2Scenarios(page, viewport) {
  const phone = viewport === 'phone';
  const shot = (name) => page.screenshot({ path: path.join(SHOTS, `${viewport}-${name}.png`) });

  // 6. Filled map of AVG(price) by zone (geo role inferred from the column).
  let t = Date.now();
  await pickChart(page, 'Filled map', viewport);
  await expectChart(page, 'filled map');
  mark(`${viewport}: filled map (layer load) → painted`, Date.now() - t);
  let s = await currentSpec(page);
  assert(s.chartType === 'map-choropleth', `expected map-choropleth, got ${s.chartType}`);
  assert(s.shelves.columns[0]?.field === 'zone', "zone is not the map's area field");
  await openPillMenu(page, phone, 'color', 'price');
  await menuPick(page, 'Aggregation');
  await menuPick(page, 'Average');
  await closeSheet(page);
  await expectGroups(page, 7, 'filled map');
  await expectChart(page, 'filled map (avg)');
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.shelves.color[0]?.aggregation === 'avg', `color pill aggregation is ${s.shelves.color[0]?.aggregation}`);
  await shot('8-map-fill');
  // Palette dialog: 67 palettes grouped by family (a continuous Color pill shows the sequential + diverging kinds).
  await page.locator('.chart-head button', { hasText: 'Palette' }).click();
  const palette = page.getByRole('dialog', { name: 'Color palette' });
  await palette.waitFor({ state: 'visible', timeout: TIMEOUT });
  const families = await palette.locator('section[data-family]').count();
  const swatches = await palette.locator('.swatch').count();
  assert(families >= 10 && swatches >= 20, `palette dialog shows ${swatches} palettes in ${families} families`);
  await palette.locator('section[data-family="ocean"] .swatch').first().click();
  await palette.getByRole('button', { name: 'Done' }).click();
  await expectChart(page, 'filled map with the ocean palette');
  s = await currentSpec(page);
  assert(s.palette.mode === 'manual' && /^seq-ocean|^ocean/.test(s.palette.sequential ?? s.palette.diverging ?? ''), `palette after choosing: ${JSON.stringify(s.palette)}`);
  await shot('8-map-palette');
  for (const mm of ['bubble', 'symbol', 'fill']) {
    const card = await marksCard(page, phone);
    await card.locator('select[aria-label="Map mark"]').selectOption(mm);
    await closeSheet(page);
    await expectChart(page, `map mark ${mm}`);
    if (mm === 'bubble') await shot('8-map-bubble');
  }

  // 7. Envelope of price by hour of day, percentile mode. (Eligibility reads the current shelves: from the map the
  // measure sits on Color, so go through Bar, which puts it back on Rows.)
  await pickChart(page, 'Bar', viewport);
  await expectChart(page, 'bar before envelope');
  t = Date.now();
  await pickChart(page, 'Envelope', viewport);
  await openPillMenu(page, phone, 'detail', 'zone');
  await menuPick(page, 'Remove');
  await openPillMenu(page, phone, 'columns', 'timestamp');
  await menuPick(page, 'Date part (discrete)');
  await menuPick(page, 'Hour');
  await closeSheet(page);
  await expectGroups(page, 24, 'envelope');
  await expectChart(page, 'envelope');
  mark(`${viewport}: envelope by hour (percentile bands) → painted`, Date.now() - t);
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.chartType === 'envelope', `expected envelope, got ${s.chartType}`);
  assert((s.envelope?.mode ?? 'percentile') === 'percentile', 'envelope is not in percentile mode');
  await shot('9-envelope');
  {
    const card = await marksCard(page, phone);
    await card.locator('[data-section="envelope"] .chip[data-level="p25-p75"]').click();
    await closeSheet(page);
    await expectChart(page, 'envelope one band');
    await page.waitForTimeout(400);
    s = await currentSpec(page);
    assert(JSON.stringify(s.envelope?.levels) === '[[5,95]]', `levels after toggling P25–P75 off: ${JSON.stringify(s.envelope?.levels)}`);
    const card2 = await marksCard(page, phone);
    await card2.locator('[data-section="envelope"] .chip[data-level="p25-p75"]').click();
    await closeSheet(page);
    await expectChart(page, 'envelope two bands');
  }

  // 8. Combo bar + line with a dual axis.
  await place(page, phone, 'demand_mw', 'rows');
  await expectChart(page, 'envelope with two measures');
  t = Date.now();
  await pickChart(page, 'Combo (bar + line)', viewport);
  await expectChart(page, 'combo');
  mark(`${viewport}: combo (dual axis) → painted`, Date.now() - t);
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.chartType === 'combo', `expected combo, got ${s.chartType}`);
  assert(s.shelves.rows.length === 2 && s.shelves.rows.filter((p) => p.axis === 'secondary').length === 1, `rows after combo: ${JSON.stringify(s.shelves.rows.map((p) => [p.field, p.axis]))}`);
  await openPillMenu(page, phone, 'rows', 'demand');
  assert(await page.locator('.menu__item').filter({ hasText: 'Dual axis' }).count() === 1, 'pill menu lacks "Dual axis"');
  await menuPick(page, 'Synchronize axis');
  await closeSheet(page);
  await expectChart(page, 'combo synchronized');
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.axes.synchronized === true, 'axes.synchronized not set');
  await shot('10-combo');

  // 9. Line (one measure) with an average reference line and a linear trend line.
  await openPillMenu(page, phone, 'rows', 'demand');
  await menuPick(page, 'Remove');
  await closeSheet(page);
  await pickChart(page, 'Line', viewport);
  await expectChart(page, 'line');
  let dlg = await openFormat(page, 'Reference lines');
  await dlg.getByRole('button', { name: 'Add line' }).click();
  await dlg.getByRole('button', { name: 'Done' }).click();
  dlg = await openFormat(page, 'Trend line');
  await dlg.locator('input[aria-label="Show trend line"]').check();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expectChart(page, 'line with reference + trend');
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.referenceLines.length === 1 && s.referenceLines[0].kind === 'average', `reference lines: ${JSON.stringify(s.referenceLines)}`);
  assert(s.trendLine.enabled === true, 'trend line not enabled');
  await shot('11-line-decorations');

  // 10. Style panel font change; gridlines off through the Y-axis dialog.
  const fontBefore = s.style.fontFamily;
  dlg = await openFormat(page, 'Style panel');
  await dlg.locator('.style__font').click();
  const options = dlg.locator('#style-fonts [role="option"]');
  await options.first().waitFor({ state: 'visible', timeout: TIMEOUT });
  const n = await options.count();
  for (let i = 0; i < n; i++) {
    if ((await options.nth(i).getAttribute('aria-selected')) !== 'true') { await options.nth(i).click(); break; }
  }
  await closeDialog(page);
  dlg = await openFormat(page, 'Y axis');
  await dlg.locator('input[aria-label="Gridlines"]').uncheck();
  await dlg.getByRole('button', { name: 'Done' }).click();
  await expectChart(page, 'styled line');
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.style.fontFamily !== fontBefore, `font family unchanged (${fontBefore})`);
  assert(s.axes.y.gridlines === false, 'y gridlines still on');
  await shot('12-style');

  // 11. Annotation: click a bar, type a note.
  await pickChart(page, 'Bar', viewport);
  await expectChart(page, 'bar for annotation');
  const canvas = page.locator('.chart-canvas canvas').first();
  const box = await canvas.boundingBox();
  // 24 bars with gaps: sweep a few x positions near the middle and a few heights above the axis until a bar is hit.
  let opened = false;
  outer: for (const dy of [50, 90, 140]) {
    for (const fx of [0.5, 0.52, 0.54, 0.56, 0.48, 0.46, 0.6]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height - dy);
      const editor = page.getByRole('dialog', { name: 'Add annotation' });
      if (await editor.waitFor({ state: 'visible', timeout: 1000 }).then(() => true, () => false)) { opened = true; break outer; }
    }
  }
  assert(opened, 'a click on the bar chart never opened the annotation editor');
  const editor = page.getByRole('dialog', { name: 'Add annotation' });
  await editor.locator('textarea[aria-label="Annotation text"]').fill('Evening peak');
  await editor.getByRole('button', { name: 'Add', exact: true }).click();
  await editor.waitFor({ state: 'hidden', timeout: TIMEOUT });
  await expectChart(page, 'bar with annotation');
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.annotations.length === 1 && s.annotations[0].text === 'Evening peak', `annotations: ${JSON.stringify(s.annotations)}`);
  await shot('13-annotation');

  // 12. Symbol map from a device-opened lat/lon file with power-gen icons.
  await page.locator('.topnav__dataset').click();
  const picker = page.getByRole('dialog', { name: 'Open a dataset' });
  await picker.waitFor({ state: 'visible', timeout: TIMEOUT });
  t = Date.now();
  await picker.locator('input[type="file"]').setInputFiles(PLANTS);
  await picker.waitFor({ state: 'hidden', timeout: TIMEOUT });
  mark(`${viewport}: open plants.csv from device → loaded`, Date.now() - t);
  if (phone) {
    await page.getByRole('button', { name: 'Data', exact: true }).click();
    await page.locator('.sheet [data-field="lat"]').waitFor({ state: 'visible', timeout: TIMEOUT });
  } else {
    await page.locator('.pane--fields [data-field="lat"]').waitFor({ state: 'visible', timeout: TIMEOUT });
  }
  await place(page, phone, 'lon', 'columns');
  await place(page, phone, 'lat', 'rows');
  await place(page, phone, 'city', 'detail');
  t = Date.now();
  await pickChart(page, 'Symbol map', viewport);
  await expectChart(page, 'symbol map');
  mark(`${viewport}: symbol map from lat/lon → painted`, Date.now() - t);
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.chartType === 'map-symbol', `expected map-symbol, got ${s.chartType}`);
  // Show Me put the one dimension on Color; one mark per plant wants it on Detail.
  if (s.shelves.color.length) {
    await openPillMenu(page, phone, 'color', 'city');
    await menuPick(page, 'Move to');
    await menuPick(page, 'Detail');
    await closeSheet(page);
  }
  await place(page, phone, 'fuel', 'shape');
  await expectGroups(page, 12, 'symbol map');
  await expectChart(page, 'symbol map with shapes');
  {
    const card = await marksCard(page, phone);
    await card.locator('[data-section="shape"] button', { hasText: 'Icons' }).click();
    const icons = page.getByRole('dialog', { name: 'Shape icons' });
    await icons.waitFor({ state: 'visible', timeout: TIMEOUT });
    await icons.locator('[role="option"].set', { hasText: 'Power generation' }).click();
    await icons.getByRole('button', { name: 'Done' }).click();
    const card2 = await marksCard(page, phone);
    await card2.locator('select[aria-label="Map layer"]').selectOption('ercot-zones');
    await closeSheet(page);
  }
  await expectChart(page, 'icon symbol map on the zones layer');
  await page.waitForTimeout(400);
  s = await currentSpec(page);
  assert(s.marks.shapeSet === 'power-gen', `shape set is ${s.marks.shapeSet}`);
  assert(s.geoLayer === 'ercot-zones', `geo layer is ${s.geoLayer}`);
  assert(s.shelves.shape[0]?.field === 'fuel', 'fuel is not on Shape');
  await shot('14-symbol-map-icons');
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
  // Tableau's Automatic mark: `zone` carries the inferred ERCOT-zone role, so zone × price opens as a filled map (v2).
  await expectChart(page, 'automatic filled map');
  mark(`${viewport}: two drops → filled map painted (layer fetched)`, Date.now() - t2);
  await page.waitForTimeout(400); // hash debounce
  let s = await currentSpec(page);
  assert(s.chartType === 'map-choropleth', `expected map-choropleth after the drops (zone has a geo role), got ${s.chartType}`);
  await page.screenshot({ path: path.join(SHOTS, `${viewport}-4-automatic-map.png`) });

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

  // 6–12. v2 features (T6).
  await v2Scenarios(page, viewport);

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
    const viewports = (process.env.E2E_VIEWPORTS ?? 'desktop,phone').split(',').map((v) => v.trim()).filter(Boolean);
    for (const viewport of viewports) {
      try {
        await scenario(browser, server.base, viewport);
        results.push(`PASS ${viewport}`);
      } catch (e) {
        results.push(`FAIL ${viewport}: ${e instanceof Error ? e.message : String(e)}`);
        if (!(e instanceof Failure)) console.error(e);
        for (const ctx of browser.contexts()) for (const p of ctx.pages()) await p.screenshot({ path: path.join(SHOTS, `${viewport}-FAIL.png`) }).catch(() => {});
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
