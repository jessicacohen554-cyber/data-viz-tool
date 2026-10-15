# ERCOT model-output datasets

These CSVs are **model outputs of a market-simulator calibration run**, not
measured ERCOT data. The run's own scorecard (`metrics.json`, rubric v3.17)
records the determination **NOT-YET** with the reasons "undocumented
out-of-tolerance (FAIL) criteria: fuelmix, price_mean, price_shape" plus two
owner-signed configuration-exception caveats for 2023 mean LMP (model $48.98 vs
actual $65.02) and 2023 price shape (NRMSE 0.393). Treat every number here as a
simulated series suitable for exercising the viz tool, never as a quotable
market statistic.

## Provenance

| Item | Value |
| --- | --- |
| Source bundle | `results/calibration/closeout_ercot_l1_span/` in the `market-simulator` repo (read-only clone at `/home/user/jessicacohen554-cyber/market-simulator`) |
| Keeper `run_id` | `2026-10-02-closeout-l1-coal-fuel` (ERCOT, years 2019–2025, pass `P1`, 8760 hours/year) |
| market-simulator HEAD sha (clone read) | `80521461efcf7c3add84fa95137a6b8c247eccf1` |
| `meta.json` `git_sha` (code that produced the bundle) | `106d6bb7` (`basis_sha` `106d6bb737488f4086151907b4dbc4a45ee17306`) |
| `meta.json` timestamp | `2026-10-02T14:27:35` |
| Conversion date | 2026-10-15 |
| Conversion script | `scripts/convert_keeper_bundle.py` (pyarrow 26.0.0, pandas 3.0.6, Python 3.13) |
| Inputs read | `hourly/system_2019..2025.parquet` (all four files), `hourly/class_hourly_2024.parquet` (generation file only) |

Regenerate with:

```
python scripts/convert_keeper_bundle.py \
  --bundle <path-to>/results/calibration/closeout_ercot_l1_span \
  --out data/datasets
```

## Calendar mapping (verified in the simulator source)

The parquet files carry an integer `hour` in `0..8759`, not a timestamp. The
simulator runs every year on a **fixed non-leap 8760-hour clock**:

* `src/market_sim/utils/hour_calendar.py` (module docstring, lines 1–11):
  "Every ISO-year the model solves runs on a fixed non-leap clock: 8760 hours,
  the twelve months always at their common-year lengths, Feb 29 dropped in leap
  years. Hour `k` is the k-th chronological hour after local **standard**-time
  midnight on Jan 1 — a fixed-offset (UTC-N, no daylight-saving) clock."
  `DAYS_IN_MONTH_NOLEAP = (31, 28, 31, ...)` at line 59.
* `src/market_sim/data/eia930/frames.py::_eia_hourly_frame` (lines 749–756 and
  1126–1129): the demand/renewables loader restricts rows to the local year,
  sorts by UTC, and explicitly drops the local Feb 29 of a leap year so the
  series is exactly 8760 rows; "Row 0 is the first local hour of the year".
* `src/market_sim/model/interchange/pjm.py` lines 396–397: "The model's fixed
  8760-hour clock drops Feb 29, so non-leap month boundaries align exactly in
  every year." The same comment appears in `interchange/miso.py:76-78`,
  `interchange/nyiso.py:699-700` and `interchange/caiso.py:2229-2230`.
* `src/market_sim/data/campd.py:673-688` (`_hour_index_8760`): Feb 29 maps to
  `-1` and is dropped.

Consequences for these CSVs:

* `hour` → calendar is `datetime(year, 1, 1) + hour` on a 365-day month table.
  Hour 1415 is `Feb 28 23:00` and hour 1416 is `Mar 1 00:00` in every year,
  **including 2024**: there is no `2024-02-29` row anywhere. 2024 has 365 days
  × 24 hours like the other years.
* Timestamps are **calendar-naive local standard time (CST, UTC-6, no DST)**.
  They are written as ISO `YYYY-MM-DDTHH:00` with no timezone suffix; do not
  interpret them as UTC or as prevailing (CDT-shifted) wall-clock time.
* `weekday` is the real Gregorian weekday of the mapped date (e.g. 2024-03-01
  is `Fri`, correctly following 2024-02-28 `Wed` with the Thursday Feb 29
  removed).

## Files

| File | Rows | Bytes | Grain |
| --- | ---: | ---: | --- |
| `ercot-system-hourly-2019-2025.csv` | 429,240 | 34,140,837 | hour × zone, 2019–2025 (7 zones × 8760 × 7 years) |
| `ercot-system-hourly-2024.csv` | 61,320 | 4,866,164 | hour × zone, 2024 only |
| `ercot-system-daily-2019-2025.csv` | 17,885 | 1,397,940 | date × zone, 2019–2025 (7 zones × 365 × 7 years) |
| `ercot-generation-by-class-hourly-2024.csv` | 131,400 | 4,903,938 | hour × class, 2024 (15 classes × 8760) |

Row order: hourly files by (`year`, model hour, `zone`); daily by (`date`,
`zone`); generation by (model hour, `class`). All floats are rounded to 3
decimals and `-0.0` is normalised to `0.0`. No nulls.

Zones (7): `Houston`, `North`, `Northeast`, `Panhandle`, `South`,
`South_Central`, `West`.

### `ercot-system-hourly-2019-2025.csv` and `ercot-system-hourly-2024.csv`

| Column | Unit / type | Source | Notes |
| --- | --- | --- | --- |
| `timestamp` | `YYYY-MM-DDTHH:00`, local standard time, naive | derived from `year`, `hour` | see calendar mapping |
| `year` | int | `year` | 2019–2025 |
| `month` | int 1–12 | derived | |
| `day` | int 1–31 | derived | never 29 in February |
| `hour_of_day` | int 0–23 | derived (`hour % 24`) | interval-beginning |
| `weekday` | `Mon`..`Sun` | derived | real calendar weekday |
| `zone` | string | `zone` | model load zone |
| `price_usd_mwh` | $/MWh | `price` | zonal energy price (LP dual, incl. adders) |
| `demand_mw` | MW | `demand` | zonal hourly load served by the model |
| `unserved_mw` | MW | `slack` | unserved energy (LP load-shed slack); zero in every row except 6 hours of Feb 14 2021, see below |
| `reserve_price_usd_mw` | $/MW-h | `reserve_price` | reserve (AS) shadow price |
| `marginal_emission_rate` | t CO2 / MWh | `marginal_emission_rate` | marginal unit's emission rate |
| `ordc_adder_usd_mwh` | $/MWh | `ordc_adder` | ORDC scarcity adder component |
| `rtordpa_overlay_usd_mwh` | $/MWh | `rtordpa_overlay` | **kept**: non-zero in 47,768 of 429,240 rows (every year; per-year non-zero rows 2019: 1,029; 2020: 1,323; 2021: 7,112; 2022: 12,992; 2023: 6,916; 2024: 6,944; 2025: 11,452) |

Columns dropped from the parquet and why:

* `pass` — constant `P1` in every row.
* `dump` — zero in every row of every year.
* `slack` is **kept** (as `unserved_mw` / `unserved_mwh`) because it is not
  all-zero: 6 rows in 2021 carry unserved energy (model hours 1074–1079 =
  `2021-02-14T18:00` to `23:00`, one zone per hour: West 236.050 (18:00),
  South 436.489 (19:00), West 849.829 (20:00), Northeast 676.650 (21:00),
  Houston 739.413 (22:00), South 74.192 (23:00) MW; total 3,012.623 MWh). This
  is the model's Winter Storm Uri load shed. Every other row of every year is
  `0.0`.

### `ercot-system-daily-2019-2025.csv`

Grouped by (`date`, `zone`) over the 24 hours of each model day.

| Column | Unit | Definition |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | local standard-time date |
| `year`, `month` | int | from `date` |
| `weekday` | `Mon`..`Sun` | real calendar weekday |
| `zone` | string | as above |
| `avg_price_usd_mwh` | $/MWh | mean of the 24 hourly `price` values (unweighted) |
| `max_price_usd_mwh` | $/MWh | max hourly `price` |
| `min_price_usd_mwh` | $/MWh | min hourly `price` |
| `energy_mwh` | MWh | sum of the 24 hourly `demand` values (1 h steps, so MW·h = MWh) |
| `unserved_mwh` | MWh | sum of the 24 hourly `slack` values; non-zero only on `2021-02-14` (West 1,085.880, Houston 739.413, Northeast 676.650, South 510.681) |
| `peak_demand_mw` | MW | max hourly `demand` |
| `avg_reserve_price_usd_mw` | $/MW-h | mean hourly `reserve_price` |

### `ercot-generation-by-class-hourly-2024.csv`

From `hourly/class_hourly_2024.parquet` (`klass`, `hour`, `mw`).

| Column | Unit | Definition |
| --- | --- | --- |
| `timestamp` | `YYYY-MM-DDTHH:00`, naive local standard time | as above |
| `class` | string | the parquet `klass` value (15 classes) |
| `fuel_group` | string | mapped from `class`, table below |
| `generation_mw` | MW | `mw`; hourly dispatched output of that class, ERCOT-wide |

`fuel_group` mapping (`FUEL_GROUP_BY_CLASS` in the script; any other `COAL_*`
class also maps to Coal; any other unknown class aborts the conversion):

| Classes | `fuel_group` |
| --- | --- |
| `CC_CHP`, `CC_REGULAR`, `CT_CHP`, `CT_PEAKER`, `ST_CHP`, `ST_GAS` | Gas |
| `COAL_LIGNITE`, `COAL_PRB` | Coal |
| `wind` | Wind |
| `solar` | Solar |
| `hydro` | Hydro |
| `nuclear` | Nuclear |
| `biomass` | Biomass |
| `oil` | Oil |
| `OTHER` | Other |

Storage (`hourly/storage_2024.parquet`, one `li_ion` tech) is not included in
any CSV; charge/discharge are therefore not part of the generation file.

## Tests

`tests/py/test_convert_keeper_bundle.py` builds a synthetic 2-zone × 48-hour
bundle (2023 hours 0–47 and 2024 hours 1392–1439, which straddle Feb 28 → Mar
1) and checks row counts, column order, the Feb 29 skip, the daily aggregation
arithmetic and the fuel-group failure on an unknown class. The fixture values
are test scaffolding only; nothing in this directory is derived from them.
