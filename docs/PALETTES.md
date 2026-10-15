> Status: ACTIVE — the palette registry (plan §8, D-10, D-12; rule 7 `[R-PALETTE]`). The registry `src/lib/palette/registry.ts` must list exactly these ids; validation results are re-run, never re-typed.

# Palettes

Every palette is `{id, label, kind, colors[], hue?, colorblindSafe,
labelsRequired, tags, validation}`. Categorical sets are fixed hex lists in
**fixed order, never cycled** (rule 7); sequential and diverging ramps are
**generated in OKLCH** so they are monotone in lightness by construction
(§2). Hex values below are the Observatory tokens of
`market-simulator/docs/codebase-site/css/shared.css` (`:root`) and the two
ramps of `bc-pages.css`; the only colors without an Observatory anchor are
marked.

## 1. Categorical sets

| `id` | Label | Colors (fixed order) | CVD-safe | Labels required | Usage rule |
|---|---|---|---|---|---|
| `observatory` | Observatory | 1 `#F59E0B` solar · 2 `#22C55E` wind · 3 `#0EA5E9` hydro · 4 `#6366F1` nuclear · 5 `#6B7280` fossil-gas · 6 `#374151` fossil-coal · 7 `#E67E22` storage · 8 `#26A69A` ccs · 9 `#10B981` hydrogen · 10 `#92400E` oil · 11 `#D97706` geothermal · 12 `#009688` offshore | no | **yes** (§5) | the default (D-10); name matching (§3) assigns entity colors, the rest take the remaining hues in order. Slots 11–12 are near-duplicates of 1 and 8 and are reached only at ≥ 11 categories |
| `observatory-iso` | Observatory ISO | `#F59E0B` caiso · `#22C55E` ercot · `#0EA5E9` pjm · `#E91E63` nyiso · `#9C27B0` neiso · `#F97316` miso · `#14B8A6` spp · `#6366F1` soco · `#65A30D` nwpp | no | **yes** | auto-selected when ≥ 50% of a field's values match an ISO token (§3) |
| `okabe-ito` | Okabe–Ito | `#E69F00` `#56B4E9` `#009E73` `#F0E442` `#0072B2` `#D55E00` `#CC79A7` `#000000` (no Observatory anchor; Okabe & Ito 2008) | **yes** | no | the CVD-safe choice; the validator warns on yellow's contrast and black's lightness, not on separation |
| `classic-10` | Classic 10 | `#4E79A7` `#F28E2B` `#E15759` `#76B7B2` `#59A14F` `#EDC948` `#B07AA1` `#FF9DA7` `#9C755F` `#BAB0AC` (Tableau 10; no Observatory anchor) | no (CVD 11.9 passes; normal-vision 14.0 fails) | **yes** | for users who want Tableau's look |
| `pairs-amber-indigo` | Amber / Indigo | `#F59E0B` `#6366F1` | yes | no | complementary pair; default for `dumbbell` and `slope` (§4) |
| `pairs-sky-orange` | Sky / Orange | `#0EA5E9` `#E67E22` | yes | no | pair |
| `pairs-green-magenta` | Green / Magenta | `#22C55E` `#E91E63` | yes | no | pair |
| `pairs-teal-brown` | Teal / Brown | `#26A69A` `#92400E` | yes | no | pair |
| `pairs-navy-gold` | Navy / Gold | `#1A2744` `#EAB308` (gold: no Observatory anchor) | yes | no | pair; navy fails the lightness band — fine for two series, noted in the picker |
| `pairs-purple-lime` | Purple / Lime | `#9C27B0` `#65A30D` | yes | no | pair |
| `pastel` | Pastel | the 10 Observatory colors composited at 55% over white (`--*-55` tokens): `#FACA79` `#85DFA6` `#7ACEF3` `#A9ABF7` `#AEB1B9` `#91969F` `#F1B885` `#88CEC7` `#7CD8BA` `#C3967A` | no | yes | backgrounds and area fills; never for lines < 2px |
| `bold` | Bold | the 10 Observatory hues at OKLCH L 0.55, C 0.17 (gamut-clipped), generated | no | yes | dark surface in a later theme; shipped for parity |
| `grayscale` | Grayscale | OKLCH L 0.86 0.74 0.62 0.50 0.38 0.25, C 0 | yes (luminance only) | yes | print and labels-first tables |

Categories beyond a set's length are drawn in `--border #D4D8E0` and the
legend shows "+k more"; the picker suggests a Top N filter. Hues are never
recycled (rule 7).

## 2. Ramps (generated)

### 2.1 Sequential, single hue

7 stops, OKLCH `L = 0.95, 0.85, 0.75, 0.65, 0.55, 0.45, 0.35` (ΔL 0.10),
hue fixed at the Observatory anchor's OKLCH hue, chroma
`C(L) = C_max · (1 − |L − 0.60| / 0.45)` then gamut-clipped to sRGB
(reduce C until in gamut). Light → dark; `reverse` flips.

| `id` | Label | Hue (°) | Anchor | `C_max` |
|---|---|---|---|---|
| `seq-sky` | Sky | 237 | `#0EA5E9` hydro | 0.14 |
| `seq-indigo` | Indigo | 277 | `#6366F1` nuclear | 0.14 |
| `seq-green` | Green | 150 | `#22C55E` wind | 0.14 |
| `seq-amber` | Amber | 70 | `#F59E0B` solar | 0.14 |
| `seq-orange` | Orange | 56 | `#E67E22` storage | 0.14 |
| `seq-navy` | Navy | 265 | `#1A2744` navy | 0.08 |
| `seq-gray` | Gray | 262 | `#6B7280` fossil-gas | 0.02 |
| `seq-teal` | Teal | 185 | `#26A69A` ccs | 0.12 |
| `seq-rose` | Rose | 10 | `#E91E63` nyiso | 0.14 |

**Continuous vs stepped use.** On a continuous Color pill the 7 stops feed
`visualMap` as a gradient (the light end deliberately approaches the page
surface: "little" reads as "faint"). On a discrete use (histogram bins,
quantile classes, stepped Size) the ramp is sampled from stops **3–7**
(L 0.75 → 0.35) so the lightest class clears the validator's 2:1 light-end
floor (§5).

### 2.2 Sequential, multi-hue (flagged)

| `id` | Label | Stops | Flag |
|---|---|---|---|
| `viridis` | Viridis | the standard 7-sample of matplotlib viridis (`#440154` `#443983` `#31688E` `#21918C` `#35B779` `#90D743` `#FDE725`) | multi-hue; monotone L |
| `magma` | Magma | `#000004` `#3B0F70` `#8C2981` `#DE4968` `#FE9F6D` `#FCFDBF` (6) | multi-hue; monotone L |
| `cividis` | Cividis | `#00224E` `#123570` `#3B496C` `#575D6D` `#707173` `#8A8678` `#A69D75` `#C4B56C` `#E4CF5B` `#FEE838` (10) | multi-hue; monotone L; CVD-optimised |
| `seq-observatory-heat` | Observatory heat | `#e8f3f7` `#7fc4e6` `#86c98f` `#f2d65c` `#ef8f3c` `#c0392b` (`bc-pages.css` `.color-ramp`) | **multi-hue, non-monotone** (L 0.96 0.79 0.78 0.88 0.74 0.54); shipped only for parity with the market-simulator dashboards; never auto-selected |

### 2.3 Diverging (temperature)

9 stops: cool arm = 4 stops of the cool hue's sequential ramp at
L 0.35, 0.50, 0.65, 0.80 (dark → light), a neutral midpoint, warm arm =
L 0.80, 0.65, 0.50, 0.35. Both arms share the L profile, so the ramp is
symmetric by construction. The midpoint value is `PaletteSelection.midpoint`
(`'zero'` default, `'mean'`, `'median'` or a number).

| `id` | Label | Cool hue (anchor) | Mid | Warm hue (anchor) |
|---|---|---|---|---|
| `div-cool-warm` | Cool–Warm | 237 (`#0EA5E9`) | gray, OKLCH L 0.90 C 0 (≈ `#E1E1E1`) | 27 (`#DC2626` `--negative`) |
| `div-observatory` | Observatory | fixed stops from `bc-pages.css` `.delta-ramp`: `#2166ac` `#86a9d4` **`#ffffff`** `#f0b27a` `#e67e22` (5, white mid) | white | — |
| `div-teal-brown` | Teal–Brown | 185 (`#26A69A`) | gray L 0.90 | 46 (`#92400E`) |
| `div-green-purple` | Green–Purple | 150 (`#22C55E`) | gray L 0.90 | 321 (`#9C27B0`) |
| `div-sky-amber` | Sky–Amber | 237 (`#0EA5E9`) | gray L 0.90 | 70 (`#F59E0B`) |
| `div-navy-gold` | Navy–Gold | 265 (`#1A2744`), `C_max` 0.08 | gray L 0.90 | 86 (`#EAB308`, no anchor) |

`div-observatory` is the one fixed-list diverging ramp (its white midpoint is
the market-simulator LMP-delta convention); on the page surface its mid stop
is invisible without a cell border, so heatmap cells always draw a
`--border-light` border.

## 3. Observatory name matching (D-10)

Applies when `PaletteSelection.mode === 'auto'`, the Color pill is discrete,
and the categorical palette is `observatory` (the default) or
`observatory-iso`. Labels are lower-cased and split into tokens on any
non-alphanumeric character. Rules are tried **in this order**; the first
match wins. A key of ≤ 2 characters matches a whole token only; longer keys
match as substrings of the label.

| # | Keys | Color | Token |
|---|---|---|---|
| 1 | `offshore` | `#009688` | offshore |
| 2 | `hydrogen`, `biomass` | `#10B981` | hydrogen (biomass → the green "hydrogen" slot; no biomass token exists in Observatory) |
| 3 | `geothermal` | `#D97706` | geothermal |
| 4 | `solar`, `pv` | `#F59E0B` | solar |
| 5 | `wind` | `#22C55E` | wind |
| 6 | `nuclear` | `#6366F1` | nuclear |
| 7 | `hydro` | `#0EA5E9` | hydro (after rule 2 so `hydrogen` never matches here) |
| 8 | `storage`, `battery`, `li_ion`, `bess` | `#E67E22` | storage |
| 9 | `coal`, `lignite` | `#374151` | fossil-coal |
| 10 | `gas`, `cc`, `ct`, `ng`, `ccgt` | `#6B7280` | fossil-gas (`cc`, `ct`, `ng` whole-token only, so `account` never matches) |
| 11 | `ccs` | `#26A69A` | ccs (checked before rule 10's `cc` token because `ccs` is a longer key tried first within the row set — implement as: longest key wins across rows 10–11) |
| 12 | `oil`, `diesel` | `#92400E` | oil |
| 13 | `caiso`, `ercot`, `pjm`, `nyiso`, `neiso`, `isone`, `iso-ne`, `miso`, `spp`, `soco`, `nwpp` | the `observatory-iso` color | ISO (whole token) |
| — | anything else | next unused Observatory hue in order | other; `other` / `unknown` / `misc` literally → `#6B7280` gray |

Auto-mapping engages only when ≥ 50% of the field's distinct values match a
rule; below that the palette is assigned in fixed order over the sorted
domain. Either way the **label → color map is computed once per field on the
full dictionary** (not on the filtered result), stored with the view in
`PaletteSelection.overrides` when the user edits it, so filtering never
repaints survivors (rule 7).

For the ERCOT files: `fuel_group` values `Gas`, `Coal`, `wind`, `solar`,
`hydro`, `nuclear`, `biomass`, `oil`, `OTHER` all resolve (`OTHER` → gray);
`zone` values do not match and take fixed order.

## 4. How the Color shelf resolves (`pick.ts`)

| Color pill | Result (`ColorEncoding`) |
|---|---|
| none | single color: Observatory sky `#0EA5E9` (`--hydro`); `dumbbell`/`slope`/`candlestick`/`waterfall` keep their fixed two-color semantics |
| discrete | `categorical`: `pairs-amber-indigo` for `dumbbell` and `slope`, `observatory` otherwise, unless `PaletteSelection.categorical` names another; per-label `overrides` win; map stable per field (§3) |
| continuous | `sequential` `visualMap` with `seq-sky` unless `PaletteSelection.sequential` names another; **diverging** (`div-cool-warm` default) when `useDiverging` is true or, in `auto` mode, when the domain spans zero; `domain: 'auto'` = `[min, max]` of the result, else the given pair; `reverse` flips |

`PaletteDialog` shows only the kind that applies to the current Color pill.

## 5. Validation

`scripts/validate_palette.js` is the dataviz skill's validator, unchanged in
thresholds; `npm test` runs it over every categorical set (and the stepped
form of every ramp) on the light surface `#F8F9FC` and on `#FFFFFF` (cards).
Thresholds, as the validator defines them:

| Check | Rule | Gate |
|---|---|---|
| Lightness band | OKLCH L ∈ [0.43, 0.77] per color | report |
| Chroma floor | OKLCH C ≥ 0.10 (below it a hue reads as gray) | report |
| CVD separation | adjacent pairs, OKLab ΔE×100 ≥ 8 (≥ 6 = warn band) under Machado 2009 protan/deutan at severity 1.0 | **`colorblindSafe`** when ≥ 8 on every adjacent pair |
| Normal-vision floor | worst adjacent pair ΔE×100 ≥ 15 unsimulated | hard |
| Contrast vs surface | WCAG ≥ 3:1 for each mark on both surfaces; below = "relief" | report |
| Ordinal (stepped ramps) | one hue (spread ≤ 40°), monotone L, adjacent ΔL ≥ 0.06, lightest step ≥ 2:1 vs surface | hard for single-hue ramps; multi-hue ramps skip the hue-spread check, `seq-observatory-heat` is exempt and flagged |

**CI rule (rule 7):** a set whose `labelsRequired` is `false` must pass the
CVD gate and the normal-vision floor; a set with `labelsRequired: true` may
fail them and the picker shows "use with labels". The recorded
`validation` block in the registry must equal the validator's output, so a
flag cannot rot.

**Measured 2026-10-15** (validator at the thresholds above, surface
`#F8F9FC`):

| Set | CVD adjacent (worst) | Normal-vision (worst) | Band / chroma | Contrast < 3:1 | Verdict |
|---|---|---|---|---|---|
| `observatory` (10) | **5.7** `#22C55E`↔`#F59E0B` (protan) | **7.6** `#10B981`↔`#26A69A` | `#374151` L 0.37 out of band; `#6B7280`, `#374151` below chroma floor | solar, wind, hydro, storage, ccs, hydrogen | fails separation → `labelsRequired: true`; the neutrals are the fuel semantics (gas gray, coal slate), kept by D-10 |
| `observatory-iso` (9) | **5.7** (same pair) | 20.3 | pass | caiso, ercot, pjm, miso, spp, nwpp | fails CVD → `labelsRequired: true` |
| `okabe-ito` (8) | 15.8 | 16.4 | `#F0E442` L 0.90, `#000000` out of band / chroma | amber, sky, yellow, pink | passes separation → `colorblindSafe: true` |
| `seq-observatory-heat` | — | — | L non-monotone, hue spread 159°, light end 1.07:1 | — | exempt, flagged |

| `pairs-amber-indigo` | 36.3 | 40.3 | pass | solar | `colorblindSafe: true` |
| `pairs-sky-orange` | 25.5 | 30.8 | pass | sky, orange | `colorblindSafe: true` |
| `pairs-green-magenta` | 10.7 (deutan) | 41.3 | pass | green | `colorblindSafe: true` |
| `pairs-teal-brown` | 20.4 | 28.4 | pass | teal | `colorblindSafe: true` |
| `pairs-navy-gold` | 52.3 | 56.2 | `#1A2744` L 0.28 out of band | gold (1.82) | separation passes → `colorblindSafe: true`; the band miss is reported, not gated |
| `pairs-purple-lime` | 28.5 | 41.1 | pass | lime (2.93) | `colorblindSafe: true` |
| `classic-10` (10) | 11.9 | **14.0** `#59A14F`↔`#76B7B2` | pass | orange, teal, yellow, pink, gray | fails the normal-vision floor → `labelsRequired: true` |

`pastel`, `bold`, `grayscale` and the generated ramps are measured when S2
ships the generator; their `validation` blocks are produced by the same
script, and `npm test` fails if a block disagrees with a fresh run.
