/**
 * The style pass (docs/CHARTS.md §Style): applies `spec.style` to a built
 * ECharts option after the type builder ran — title / subtitle / caption,
 * font families from `FONT_FAMILIES`, `fontScale` on every text size,
 * background, padding and the border flag the canvas draws. Builders set
 * their own sizes through `styleFonts()` (option-common) so this pass only
 * has to fix up the chrome; it never touches `series.data`. Framework-free
 * (rule R-PURE); the Google Fonts `<link>` is injected by `lib/ui/chart/fonts.ts`.
 */
import type { BuildContext } from './registry';
import { type OptionObject, styleFonts, themeOf } from './option-common';

/** Default outer padding the v1 grid used; `style.padding` shifts every side by its difference from this. */
export const BASE_PADDING = 16;

/** Axis option(s) as an array, whatever shape the builder used. */
function axes(v: unknown): OptionObject[] {
  if (Array.isArray(v)) return v as OptionObject[];
  return v && typeof v === 'object' ? [v as OptionObject] : [];
}

/** Set `obj[key] = { ...obj[key], ...patch }` when `obj[key]` is an object (or absent and `create`). */
function merge(obj: OptionObject, key: string, patch: OptionObject, create = false): void {
  const cur = obj[key];
  if (cur && typeof cur === 'object' && !Array.isArray(cur)) obj[key] = { ...(cur as OptionObject), ...patch };
  else if (create && cur === undefined) obj[key] = patch;
}

/**
 * Apply the style panel to an option in place and return it. Title and
 * subtitle come from `style.title.text` / `style.subtitle.text` (the sheet
 * title in `spec.title` stays in the app header); the caption sits bottom-left
 * in muted text. Fonts and sizes are re-applied to axes, legend, visualMap and
 * series labels so a builder that set its own values still follows the style.
 */
export function applyStyle(ctx: BuildContext, option: OptionObject): OptionObject {
  const spec = ctx.spec;
  const st = spec.style;
  const theme = themeOf(ctx);
  const fonts = styleFonts(ctx);
  const scale = fonts.scale;

  option.textStyle = { ...((option.textStyle as OptionObject) ?? {}), fontFamily: fonts.base, color: theme.text };
  option.backgroundColor = st.background === 'transparent' ? 'transparent' : st.background;

  const grid = option.grid && typeof option.grid === 'object' && !Array.isArray(option.grid) ? (option.grid as OptionObject) : undefined;
  const bump = (key: 'top' | 'bottom' | 'left' | 'right', by: number) => { if (grid && typeof grid[key] === 'number') grid[key] = (grid[key] as number) + by; };
  const pad = st.padding - BASE_PADDING;
  if (pad !== 0) { bump('top', pad); bump('bottom', pad); bump('left', pad); bump('right', pad); }

  const titleText = st.title.text?.trim() ?? '';
  const subtitleText = st.subtitle.text?.trim() ?? '';
  if (titleText || subtitleText) {
    const titleSize = Math.round(st.title.size * scale);
    const subSize = Math.round(st.subtitle.size * scale);
    option.title = {
      show: true,
      text: titleText,
      subtext: subtitleText,
      left: st.title.align === 'center' ? 'center' : st.padding,
      top: Math.max(4, st.padding - 8),
      textStyle: { color: theme.text, fontFamily: fonts.base, fontSize: titleSize, fontWeight: st.title.weight },
      subtextStyle: { color: theme.textMuted, fontFamily: fonts.base, fontSize: subSize },
      itemGap: 4,
    };
    bump('top', (titleText ? titleSize * 1.5 : 0) + (subtitleText ? subSize * 1.6 : 0) + 8);
  } else {
    option.title = { show: false };
  }

  const captionText = st.caption.text?.trim() ?? '';
  if (captionText) {
    const size = Math.round(st.caption.size * scale);
    const graphic = Array.isArray(option.graphic) ? (option.graphic as OptionObject[]) : [];
    graphic.push({ type: 'text', left: st.padding, bottom: Math.max(2, st.padding - 10), silent: true, style: { text: captionText, fill: theme.textMuted, fontFamily: fonts.base, fontSize: size } });
    option.graphic = graphic;
    bump('bottom', size * 1.8);
  }

  const axisSize = Math.round(st.axis.size * scale);
  const axisTitleSize = Math.round(st.axis.titleSize * scale);
  for (const key of ['xAxis', 'yAxis'] as const) {
    for (const ax of axes(option[key])) {
      merge(ax, 'axisLabel', { fontSize: axisSize, fontFamily: fonts.axis });
      merge(ax, 'nameTextStyle', { fontSize: axisTitleSize, fontFamily: fonts.axis });
    }
  }
  if (option.legend && typeof option.legend === 'object') merge(option.legend as OptionObject, 'textStyle', { fontSize: Math.round(st.legend.size * scale), fontFamily: fonts.legend }, true);
  for (const vm of axes(option.visualMap)) merge(vm, 'textStyle', { fontSize: Math.round(st.legend.size * scale), fontFamily: fonts.legend }, true);
  const labelSize = Math.round(st.labels.size * scale);
  for (const s of Array.isArray(option.series) ? (option.series as OptionObject[]) : []) {
    if (s.label && typeof s.label === 'object') merge(s, 'label', { fontSize: labelSize, ...(st.labels.fontFamily ? { fontFamily: fonts.labels } : {}) });
  }

  const meta = (option.__meta as OptionObject | undefined) ?? {};
  option.__meta = { ...meta, border: st.border, fontFamily: fonts.base };
  return option;
}
