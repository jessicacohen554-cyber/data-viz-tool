<script lang="ts">
  /**
   * The pill context menu (docs/TABLEAU-SPEC.md §2–§6): aggregation, date
   * part/value with ▸ drill, discrete/continuous, sort, bin, move to shelf
   * (the keyboard alternative to drag), filter and format (opened through
   * callback props so the dialogs stay in S5), remove. Every change is one
   * `spec` store call = one undo step.
   */
  import type { Aggregation, DateLevel, FieldMeta, Pill, ShelfId, SortSpec } from '../../core/types';
  import { AGGREGATIONS, ALL_SHELVES, DATE_LEVELS, SINGLE_PILL_SHELVES } from '../../core/constants';
  import { newId } from '../../core/spec-defaults';
  import Menu, { type MenuItem, type MenuSection } from '../shared/Menu.svelte';
  import { spec } from '../../stores/spec.svelte';
  import { AGGREGATION_MENU, DATE_LEVEL_MENU, pillLabel } from './pill-label';
  import { SHELF_LABEL } from './shelf-labels';

  let {
    pill,
    shelf,
    anchor,
    meta,
    onClose,
    onFormat,
    onFilter,
  }: {
    pill: Pill;
    shelf: ShelfId;
    anchor: HTMLElement | null;
    /** Field metadata when known (drives the allowed aggregations). */
    meta?: FieldMeta;
    onClose: () => void;
    /** Open the Format dialog (S5) for this pill. */
    onFormat?: (pillId: string) => void;
    /** Open the Filter dialog (S5) for this pill. */
    onFilter?: (pillId: string) => void;
  } = $props();

  const isDate = $derived(!!pill.date);
  const isNumeric = $derived(meta ? meta.type === 'number' || meta.type === 'integer' : pill.role === 'measure' && !pill.date);

  /** Aggregations a field may use (TABLEAU-SPEC §2). */
  function allowedAggregations(): Aggregation[] {
    const t = meta?.type;
    if (!t || t === 'number' || t === 'integer') return [...AGGREGATIONS];
    if (t === 'boolean') return ['count', 'countd'];
    return ['count', 'countd', 'min', 'max'];
  }

  function update(fn: (p: Pill) => void): void { spec.updatePill(pill.id, fn); }

  function aggregationSection(): MenuSection[] {
    const allowed = allowedAggregations();
    return [{
      title: 'Measure',
      items: allowed.map<MenuItem>((a) => ({
        id: `agg-${a}`,
        label: AGGREGATION_MENU[a],
        checked: pill.role === 'measure' && pill.aggregation === a,
        onSelect: () => update((p) => {
          p.aggregation = a;
          p.role = 'measure';
          delete p.date;
          delete p.bin;
          if (a === 'none') p.continuity = 'continuous';
        }),
      })),
    }];
  }

  function dateSection(mode: 'part' | 'trunc'): MenuSection[] {
    return [{
      items: DATE_LEVELS.map<MenuItem>((lvl) => ({
        id: `date-${mode}-${lvl}`,
        label: DATE_LEVEL_MENU[lvl],
        hint: mode === 'part' ? partExample(lvl) : truncExample(lvl),
        checked: pill.date?.mode === mode && pill.date.level === lvl,
        onSelect: () => update((p) => {
          p.date = { level: lvl, mode };
          p.role = 'dimension';
          p.continuity = mode === 'part' ? 'discrete' : 'continuous';
        }),
      })),
    }];
  }

  function partExample(lvl: DateLevel): string {
    return { year: '2024', quarter: 'Q2', month: 'May', week: 'Wk 19', day: '8', hour: '14', minute: '07' }[lvl];
  }
  function truncExample(lvl: DateLevel): string {
    return { year: '2024', quarter: 'Q2 2024', month: 'May 2024', week: '2024-05-06', day: '2024-05-08', hour: '05-08 14:00', minute: '14:07' }[lvl];
  }

  /** Tableau's "+": add the next level after this pill on the same shelf. */
  function drillDown(): void {
    const lvl = pill.date?.level;
    if (!lvl) return;
    const next = DATE_LEVELS[DATE_LEVELS.indexOf(lvl) + 1];
    if (!next) return;
    const found = spec.findPill(pill.id);
    if (!found) return;
    const child: Pill = { ...structuredClone(pill), id: newId(), date: { level: next, mode: pill.date!.mode } };
    delete child.sort;
    spec.addPill(found.shelf, child, found.index + 1);
  }

  function sortSection(): MenuSection[] {
    const cur = pill.sort;
    const set = (s: SortSpec | undefined) => update((p) => { if (s) p.sort = s; else delete p.sort; });
    const is = (by: SortSpec['by'], dir: SortSpec['dir']) => !!cur && cur.by === by && cur.dir === dir;
    const measures = ALL_SHELVES.flatMap((s) => spec.value.shelves[s])
      .filter((p) => p.role === 'measure' && p.id !== pill.id && p.aggregation !== 'none');
    const byField: MenuItem[] = measures.flatMap((m) => (['desc', 'asc'] as const).map<MenuItem>((dir) => ({
      id: `sort-field-${m.id}-${dir}`,
      label: `${pillLabel(m)} ${dir === 'desc' ? '↓' : '↑'}`,
      checked: !!cur && cur.by === 'field' && cur.field === m.field && cur.aggregation === m.aggregation && cur.dir === dir,
      onSelect: () => set({ by: 'field', dir, field: m.field, aggregation: m.aggregation }),
    })));
    return [{
      items: [
        { id: 'sort-source', label: 'Data source order', checked: !cur || cur.by === 'source', onSelect: () => set(undefined) },
        { id: 'sort-alpha-asc', label: 'Alphabetic A → Z', checked: is('alpha', 'asc'), onSelect: () => set({ by: 'alpha', dir: 'asc' }) },
        { id: 'sort-alpha-desc', label: 'Alphabetic Z → A', checked: is('alpha', 'desc'), onSelect: () => set({ by: 'alpha', dir: 'desc' }) },
        ...(byField.length ? [{ id: 'sort-field', label: 'By field', children: [{ items: byField }] }] : []),
      ],
    }];
  }

  function moveSection(): MenuSection[] {
    return [{
      items: ALL_SHELVES.filter((s) => s !== shelf).map<MenuItem>((s) => ({
        id: `move-${s}`,
        label: SHELF_LABEL[s],
        hint: SINGLE_PILL_SHELVES.has(s) ? 'replaces' : undefined,
        onSelect: () => spec.movePill(pill.id, s),
      })),
    }];
  }

  const sections = $derived.by<MenuSection[]>(() => {
    const out: MenuSection[] = [];
    const main: MenuItem[] = [];

    if (isDate || meta?.type === 'date' || meta?.type === 'datetime') {
      main.push({ id: 'date-part', label: 'Date part (discrete)', icon: 'calendar', hint: pill.date?.mode === 'part' ? DATE_LEVEL_MENU[pill.date.level] : undefined, children: dateSection('part') });
      main.push({ id: 'date-trunc', label: 'Date value (continuous)', icon: 'calendar-clock', hint: pill.date?.mode === 'trunc' ? DATE_LEVEL_MENU[pill.date.level] : undefined, children: dateSection('trunc') });
      if (pill.date && DATE_LEVELS.indexOf(pill.date.level) < DATE_LEVELS.length - 1) {
        main.push({ id: 'drill', label: 'Drill down', icon: 'plus', hint: DATE_LEVEL_MENU[DATE_LEVELS[DATE_LEVELS.indexOf(pill.date.level) + 1]!], onSelect: drillDown });
      }
    }
    if (isNumeric || pill.role === 'measure') {
      main.push({ id: 'agg', label: 'Aggregation', icon: 'hash', hint: pill.role === 'measure' ? AGGREGATION_MENU[pill.aggregation] : undefined, children: aggregationSection() });
    } else if (!isDate) {
      // A dimension used as a measure (CNT(zone), MIN(zone)…).
      main.push({ id: 'agg', label: 'Measure', icon: 'hash', children: aggregationSection() });
    }
    if (isNumeric) {
      main.push({
        id: 'bin', label: 'Bin (histogram)', icon: 'detail', checked: !!pill.bin,
        onSelect: () => update((p) => {
          if (p.bin) { delete p.bin; p.role = 'measure'; p.continuity = 'continuous'; }
          else { p.bin = { count: 20 }; p.role = 'dimension'; p.continuity = 'discrete'; delete p.date; }
        }),
      });
    }
    out.push({ items: main });

    out.push({
      items: [
        { id: 'discrete', label: 'Discrete', checked: pill.continuity === 'discrete', onSelect: () => update((p) => { p.continuity = 'discrete'; if (p.date) p.date.mode = 'part'; }) },
        { id: 'continuous', label: 'Continuous', checked: pill.continuity === 'continuous', onSelect: () => update((p) => { p.continuity = 'continuous'; if (p.date) p.date.mode = 'trunc'; }) },
      ],
    });

    const tools: MenuItem[] = [];
    if (pill.continuity === 'discrete') {
      tools.push({ id: 'sort', label: 'Sort', icon: 'sort', hint: pill.sort ? pill.sort.by : undefined, children: sortSection() });
    }
    if (shelf === 'filters') tools.push({ id: 'filter', label: 'Edit filter…', icon: 'filter', disabled: !onFilter, onSelect: () => onFilter?.(pill.id) });
    tools.push({ id: 'format', label: 'Format…', disabled: !onFormat, onSelect: () => onFormat?.(pill.id) });
    tools.push({ id: 'move', label: 'Move to', children: moveSection() });
    out.push({ items: tools });

    out.push({ items: [{ id: 'remove', label: 'Remove', icon: 'close', danger: true, onSelect: () => spec.removePill(pill.id) }] });
    return out;
  });
</script>

<Menu {anchor} {sections} title={pillLabel(pill)} {onClose} />
