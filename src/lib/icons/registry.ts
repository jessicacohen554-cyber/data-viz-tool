/**
 * The icon registry (docs/ICONS.md §2–§3): the shipped sets in picker order,
 * lookup by id, the ECharts `path://` symbol string, and the label → icon
 * resolution a Shape pill uses. Resolution mirrors the palette rules
 * (rule 7 [R-PALETTE]): overrides win, then name matches, then the remaining
 * icons in fixed order; icons are never cycled, labels beyond the set fall
 * to the set's `other` icon when it has one. Framework-free [R-PURE].
 */
import { ARROWS } from './sets/arrows';
import { BASIC } from './sets/basic';
import { GRID } from './sets/grid';
import { PLACES } from './sets/places';
import { POWER_GEN } from './sets/power-gen';
import { WEATHER } from './sets/weather';
import type { Icon, IconSet } from './types';

/** All icon sets, in picker order. */
export const ICON_SETS: readonly IconSet[] = [BASIC, POWER_GEN, GRID, WEATHER, ARROWS, PLACES];

/** Id of the set a Shape pill starts with. */
export const DEFAULT_ICON_SET = 'basic';

/** Id of the icon that absorbs labels beyond a set's length, when the set has one. */
export const OVERFLOW_ICON_ID = 'other';

/** Shortest keyword that may match as a bare substring (§3 phase 3). */
const MIN_SUBSTRING = 3;

const BY_ID: ReadonlyMap<string, IconSet> = new Map(ICON_SETS.map((s) => [s.id, s]));

/** Lookup by id; undefined when unknown. */
export function getIconSet(id: string): IconSet | undefined {
  return BY_ID.get(id);
}

/** The ECharts symbol string of an icon: `'path://' + path`. */
export function iconSymbol(icon: Icon): string {
  return 'path://' + icon.path;
}

/** Lower-cased alphanumeric tokens of a label (`CC_REGULAR` → `['cc', 'regular']`). */
function tokensOf(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 0);
}

/** Every name an icon answers to: id, label and keywords, lower-cased. */
function namesOf(icon: Icon): string[] {
  return [icon.id, icon.label, ...icon.keywords].map((n) => n.toLowerCase().trim());
}

/** True when `needle` occurs as a contiguous run inside `hay`. */
function containsRun(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Finds the icon a label names, case-insensitively, in three passes: an
 * exact match on an icon's id, label or keyword; then the keyword whose
 * tokens occur contiguously in the label's tokens (longest keyword wins, so
 * `Offshore Wind` beats `wind`); then a keyword of ≥ 3 characters contained
 * in the label as a bare substring. Ties go to set order. Undefined when
 * nothing matches.
 */
export function matchIcon(set: IconSet, label: string): Icon | undefined {
  const norm = label.toLowerCase().trim();
  if (norm.length === 0) return undefined;
  for (const icon of set.icons) if (namesOf(icon).includes(norm)) return icon;

  const labelTokens = tokensOf(norm);
  let best: Icon | undefined;
  let bestTokens = 0;
  let bestLength = 0;
  for (const icon of set.icons) {
    for (const name of namesOf(icon)) {
      const nt = tokensOf(name);
      if (!containsRun(labelTokens, nt)) continue;
      if (nt.length > bestTokens || (nt.length === bestTokens && name.length > bestLength)) {
        best = icon; bestTokens = nt.length; bestLength = name.length;
      }
    }
  }
  if (best) return best;

  for (const icon of set.icons) {
    for (const name of namesOf(icon)) {
      if (name.length >= MIN_SUBSTRING && norm.includes(name) && name.length > bestLength) {
        best = icon; bestLength = name.length;
      }
    }
  }
  return best;
}

/**
 * Resolves labels to icons in fixed order. For each label, an override
 * (label → icon id) wins, then a name match (`matchIcon`); the remaining
 * labels take the remaining icons by position, skipping icons already
 * claimed and the `other` icon. Labels beyond the set get `other` when the
 * set has one and are otherwise left out of the result; icons never cycle.
 */
export function iconsFor(set: IconSet, labels: string[], overrides?: Record<string, string>): Record<string, Icon> {
  const byId = new Map(set.icons.map((i) => [i.id, i]));
  const out: Record<string, Icon> = {};
  const seen = new Set<string>();
  const used = new Set<string>();
  const pending: string[] = [];

  for (const label of labels) {
    if (seen.has(label)) continue;
    seen.add(label);
    const overrideId = overrides && Object.hasOwn(overrides, label) ? overrides[label] : undefined;
    const icon = (overrideId !== undefined ? byId.get(overrideId) : undefined) ?? matchIcon(set, label);
    if (icon) { out[label] = icon; used.add(icon.id); } else pending.push(label);
  }

  const overflow = byId.get(OVERFLOW_ICON_ID);
  let pos = 0;
  for (const label of pending) {
    while (pos < set.icons.length && (used.has(set.icons[pos]!.id) || set.icons[pos]!.id === OVERFLOW_ICON_ID)) pos++;
    if (pos < set.icons.length) {
      const icon = set.icons[pos++]!;
      out[label] = icon;
      used.add(icon.id);
    } else if (overflow) {
      out[label] = overflow;
    }
  }
  return out;
}
