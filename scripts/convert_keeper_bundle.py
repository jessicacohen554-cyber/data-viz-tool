"""Convert a market-simulator ERCOT keeper bundle into the viz tool's CSV datasets.

Reads the ``hourly/system_YYYY.parquet`` and ``hourly/class_hourly_YYYY.parquet``
files of a calibration keeper bundle and writes four flat CSVs plus nothing
else (the README next to them is hand-written). Every value in the CSVs is
derived from the parquet files; nothing is synthesised.

Calendar convention (verified in the market-simulator source, see
``src/market_sim/utils/hour_calendar.py`` and
``src/market_sim/data/eia930/frames.py::_eia_hourly_frame``): the model runs on
a fixed non-leap 8760-hour clock. Hour ``k`` is the k-th chronological hour
after local *standard*-time midnight on Jan 1 (fixed UTC offset, no daylight
saving), and Feb 29 is dropped in leap years, so hour 1416 is Mar 1 00:00 in
every year including 2024. Timestamps written here are therefore calendar-naive
local standard time, formatted ``YYYY-MM-DDTHH:00``.

Usage::

    python scripts/convert_keeper_bundle.py \
        --bundle <path-to-closeout_ercot_l1_span> --out data/datasets
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import sys
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq

# Hours in the model's fixed non-leap dispatch year (market_sim HOURS_PER_YEAR).
HOURS_PER_YEAR = 8760

# Hours in one calendar day; used to turn an hour-of-year index into a day index.
HOURS_PER_DAY = 24

# Common-year month lengths in days; Feb has 28 because the model clock drops
# Feb 29 (market_sim.utils.hour_calendar.DAYS_IN_MONTH_NOLEAP).
DAYS_IN_MONTH_NOLEAP = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

# Decimal places kept for every float column in the CSVs.
FLOAT_DECIMALS = 3

# Weekday labels indexed by ``datetime.date.weekday()`` (Monday == 0).
WEEKDAY_LABELS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

# The single year that gets its own hourly extract and the generation-by-class file.
FOCUS_YEAR = 2024

# Sub-directory of the bundle that holds the per-year parquet files.
HOURLY_SUBDIR = "hourly"

# File-name patterns inside ``hourly/``.
SYSTEM_FILE_PATTERN = re.compile(r"^system_(\d{4})\.parquet$")
SYSTEM_FILE_TEMPLATE = "system_{year}.parquet"
CLASS_FILE_TEMPLATE = "class_hourly_{year}.parquet"

# Output file-name templates (lower-kebab-case, per the repo's naming rule).
SYSTEM_SPAN_CSV_TEMPLATE = "ercot-system-hourly-{first}-{last}.csv"
SYSTEM_YEAR_CSV_TEMPLATE = "ercot-system-hourly-{year}.csv"
DAILY_SPAN_CSV_TEMPLATE = "ercot-system-daily-{first}-{last}.csv"
GENERATION_CSV_TEMPLATE = "ercot-generation-by-class-hourly-{year}.csv"

# Columns the system parquet must carry (checked before any conversion).
SYSTEM_REQUIRED_COLUMNS = (
    "year", "zone", "hour", "price", "demand", "slack", "reserve_price",
    "marginal_emission_rate", "rtordpa_overlay", "ordc_adder",
)

# Source column -> output column for the hourly system file. ``dump`` (zero
# everywhere) and ``pass`` (constant) are deliberately absent; ``slack`` is the
# LP's unserved-energy variable and is kept as ``unserved_mw`` because it is
# non-zero in the 2021 Uri hours; ``rtordpa_overlay`` is appended only when it
# is non-zero somewhere.
SYSTEM_MEASURE_COLUMNS = {
    "price": "price_usd_mwh",
    "demand": "demand_mw",
    "slack": "unserved_mw",
    "reserve_price": "reserve_price_usd_mw",
    "marginal_emission_rate": "marginal_emission_rate",
    "ordc_adder": "ordc_adder_usd_mwh",
}
RTORDPA_SOURCE_COLUMN = "rtordpa_overlay"
RTORDPA_OUTPUT_COLUMN = "rtordpa_overlay_usd_mwh"

# Calendar columns that lead every hourly system row, in output order.
SYSTEM_CALENDAR_COLUMNS = (
    "timestamp", "year", "month", "day", "hour_of_day", "weekday", "zone",
)

# Output column order of the daily file.
DAILY_COLUMNS = (
    "date", "year", "month", "weekday", "zone",
    "avg_price_usd_mwh", "max_price_usd_mwh", "min_price_usd_mwh",
    "energy_mwh", "unserved_mwh", "peak_demand_mw", "avg_reserve_price_usd_mw",
)

# Output column order of the generation-by-class file.
GENERATION_COLUMNS = ("timestamp", "class", "fuel_group", "generation_mw")

# Model technology class (``klass`` in class_hourly_*.parquet) -> fuel group.
# Any COAL_* class not listed here is also mapped to "Coal" (see
# ``fuel_group_for_class``); every other unlisted class is an error.
FUEL_GROUP_BY_CLASS = {
    "CC_CHP": "Gas",
    "CC_REGULAR": "Gas",
    "CT_CHP": "Gas",
    "CT_PEAKER": "Gas",
    "ST_CHP": "Gas",
    "ST_GAS": "Gas",
    "COAL_LIGNITE": "Coal",
    "COAL_PRB": "Coal",
    "wind": "Wind",
    "solar": "Solar",
    "hydro": "Hydro",
    "nuclear": "Nuclear",
    "biomass": "Biomass",
    "oil": "Oil",
    "OTHER": "Other",
}
COAL_CLASS_PREFIX = "COAL_"
COAL_FUEL_GROUP = "Coal"


# ---------------------------------------------------------------------------
# Calendar helpers
# ---------------------------------------------------------------------------

def hour_to_calendar(year: int, hour: int) -> tuple[int, int, int, int]:
    """Map a model hour index to ``(year, month, day, hour_of_day)``.

    Walks the non-leap month table, so Feb 29 never appears even when ``year``
    is a leap year (hour 1416 is always Mar 1 00:00). Raises ``ValueError`` for
    an hour outside ``[0, HOURS_PER_YEAR)``.
    """
    if not 0 <= hour < HOURS_PER_YEAR:
        raise ValueError(f"hour {hour} outside the {HOURS_PER_YEAR}-hour model clock")
    day_of_year, hour_of_day = divmod(int(hour), HOURS_PER_DAY)
    month = 1
    for days in DAYS_IN_MONTH_NOLEAP:
        if day_of_year < days:
            break
        day_of_year -= days
        month += 1
    return int(year), month, day_of_year + 1, hour_of_day


def calendar_frame(years: pd.Series, hours: pd.Series) -> pd.DataFrame:
    """Vectorised calendar columns for aligned ``years`` / ``hours`` Series.

    Returns a DataFrame (same index as the inputs) with ``timestamp``, ``year``,
    ``month``, ``day``, ``hour_of_day``, ``weekday`` and ``date``. The weekday is
    the real calendar weekday of the mapped date, so after the Feb 29 skip in a
    leap year it stays correct (Mar 1 2024 is a Friday).
    """
    pairs = pd.DataFrame({"year": years.astype(int), "hour": hours.astype(int)})
    unique_pairs = pairs.drop_duplicates()
    mapped = [hour_to_calendar(y, h) for y, h in zip(unique_pairs["year"], unique_pairs["hour"])]
    lookup = pd.DataFrame(mapped, columns=["year", "month", "day", "hour_of_day"])
    lookup["hour"] = unique_pairs["hour"].to_numpy()
    lookup["weekday"] = [
        WEEKDAY_LABELS[dt.date(y, m, d).weekday()]
        for y, m, d in zip(lookup["year"], lookup["month"], lookup["day"])
    ]
    lookup["date"] = [
        f"{y:04d}-{m:02d}-{d:02d}" for y, m, d in zip(lookup["year"], lookup["month"], lookup["day"])
    ]
    lookup["timestamp"] = [
        f"{date}T{h:02d}:00" for date, h in zip(lookup["date"], lookup["hour_of_day"])
    ]
    merged = pairs.merge(lookup, on=["year", "hour"], how="left")
    merged.index = pairs.index
    return merged.drop(columns=["hour"])


# ---------------------------------------------------------------------------
# Bundle discovery and loading
# ---------------------------------------------------------------------------

def discover_years(bundle_dir: Path) -> list[int]:
    """Return the sorted years that have a ``hourly/system_YYYY.parquet`` file."""
    hourly_dir = bundle_dir / HOURLY_SUBDIR
    if not hourly_dir.is_dir():
        raise FileNotFoundError(f"no '{HOURLY_SUBDIR}/' directory under {bundle_dir}")
    years = []
    for path in hourly_dir.iterdir():
        match = SYSTEM_FILE_PATTERN.match(path.name)
        if match:
            years.append(int(match.group(1)))
    if not years:
        raise FileNotFoundError(f"no system_YYYY.parquet files under {hourly_dir}")
    return sorted(years)


def load_system_year(bundle_dir: Path, year: int) -> pd.DataFrame:
    """Load one year's system parquet and check the required columns exist."""
    path = bundle_dir / HOURLY_SUBDIR / SYSTEM_FILE_TEMPLATE.format(year=year)
    frame = pq.read_table(path).to_pandas()
    missing = [c for c in SYSTEM_REQUIRED_COLUMNS if c not in frame.columns]
    if missing:
        raise ValueError(f"{path} is missing columns {missing}")
    return frame


def load_class_year(bundle_dir: Path, year: int) -> pd.DataFrame:
    """Load one year's class_hourly parquet (``klass`` as plain strings)."""
    path = bundle_dir / HOURLY_SUBDIR / CLASS_FILE_TEMPLATE.format(year=year)
    frame = pq.read_table(path).to_pandas()
    for column in ("klass", "hour", "mw", "year"):
        if column not in frame.columns:
            raise ValueError(f"{path} is missing column '{column}'")
    frame["klass"] = frame["klass"].astype(str)
    return frame


# ---------------------------------------------------------------------------
# Transformations
# ---------------------------------------------------------------------------

def round_floats(frame: pd.DataFrame) -> pd.DataFrame:
    """Round every float column to ``FLOAT_DECIMALS`` and normalise ``-0.0`` to ``0.0``."""
    out = frame.copy()
    float_columns = out.select_dtypes(include="floating").columns
    # Adding +0.0 after rounding turns IEEE negative zero into positive zero so
    # the CSV never shows "-0.0".
    out[float_columns] = out[float_columns].round(FLOAT_DECIMALS) + 0.0
    return out


def build_system_hourly(system: pd.DataFrame, keep_rtordpa: bool) -> pd.DataFrame:
    """Shape raw system rows into the hourly CSV layout.

    Sorted by (year, hour, zone). ``rtordpa_overlay`` is appended as the last
    column only when ``keep_rtordpa`` is true.
    """
    calendar = calendar_frame(system["year"], system["hour"])
    out = pd.concat([calendar.drop(columns=["date"]), system[["zone"]]], axis=1)
    for source, target in SYSTEM_MEASURE_COLUMNS.items():
        out[target] = system[source].to_numpy()
    columns = list(SYSTEM_CALENDAR_COLUMNS) + list(SYSTEM_MEASURE_COLUMNS.values())
    if keep_rtordpa:
        out[RTORDPA_OUTPUT_COLUMN] = system[RTORDPA_SOURCE_COLUMN].to_numpy()
        columns.append(RTORDPA_OUTPUT_COLUMN)
    out["_hour"] = system["hour"].to_numpy()
    out = out.sort_values(["year", "_hour", "zone"], kind="stable").drop(columns="_hour")
    return round_floats(out[columns]).reset_index(drop=True)


def build_system_daily(system: pd.DataFrame) -> pd.DataFrame:
    """Aggregate raw system rows to one row per (date, zone).

    ``energy_mwh`` is the sum of hourly ``demand`` (MW over one-hour steps, so
    MW·h == MWh); ``unserved_mwh`` is the same sum over ``slack``;
    ``peak_demand_mw`` is the maximum hourly demand.
    """
    calendar = calendar_frame(system["year"], system["hour"])
    work = pd.DataFrame({
        "date": calendar["date"],
        "year": calendar["year"],
        "month": calendar["month"],
        "weekday": calendar["weekday"],
        "zone": system["zone"].to_numpy(),
        "price": system["price"].to_numpy(),
        "demand": system["demand"].to_numpy(),
        "slack": system["slack"].to_numpy(),
        "reserve_price": system["reserve_price"].to_numpy(),
    })
    grouped = work.groupby(["date", "year", "month", "weekday", "zone"], sort=True)
    daily = grouped.agg(
        avg_price_usd_mwh=("price", "mean"),
        max_price_usd_mwh=("price", "max"),
        min_price_usd_mwh=("price", "min"),
        energy_mwh=("demand", "sum"),
        unserved_mwh=("slack", "sum"),
        peak_demand_mw=("demand", "max"),
        avg_reserve_price_usd_mw=("reserve_price", "mean"),
    ).reset_index()
    daily = daily.sort_values(["date", "zone"], kind="stable")
    return round_floats(daily[list(DAILY_COLUMNS)]).reset_index(drop=True)


def fuel_group_for_class(klass: str) -> str:
    """Return the fuel group for a model class; raise ``KeyError`` if unmapped."""
    if klass in FUEL_GROUP_BY_CLASS:
        return FUEL_GROUP_BY_CLASS[klass]
    if klass.startswith(COAL_CLASS_PREFIX):
        return COAL_FUEL_GROUP
    raise KeyError(
        f"class '{klass}' has no fuel_group mapping; add it to FUEL_GROUP_BY_CLASS"
    )


def build_generation_by_class(classes: pd.DataFrame) -> pd.DataFrame:
    """Shape class_hourly rows into (timestamp, class, fuel_group, generation_mw)."""
    unknown = sorted(
        k for k in classes["klass"].unique()
        if k not in FUEL_GROUP_BY_CLASS and not k.startswith(COAL_CLASS_PREFIX)
    )
    if unknown:
        raise KeyError(f"unmapped generation classes: {unknown}")
    calendar = calendar_frame(classes["year"], classes["hour"])
    out = pd.DataFrame({
        "timestamp": calendar["timestamp"],
        "class": classes["klass"].to_numpy(),
        "fuel_group": classes["klass"].map(fuel_group_for_class).to_numpy(),
        "generation_mw": classes["mw"].astype("float64").to_numpy(),
        "_hour": classes["hour"].to_numpy(),
    })
    out = out.sort_values(["_hour", "class"], kind="stable").drop(columns="_hour")
    return round_floats(out[list(GENERATION_COLUMNS)]).reset_index(drop=True)


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def write_csv(frame: pd.DataFrame, path: Path) -> tuple[str, int, int]:
    """Write ``frame`` to ``path`` and return ``(name, rows, bytes)`` for the summary."""
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(path, index=False, lineterminator="\n")
    return path.name, len(frame), path.stat().st_size


def convert_bundle(
    bundle_dir: Path, out_dir: Path, focus_year: int = FOCUS_YEAR
) -> list[tuple[str, int, int]]:
    """Run the full conversion and return the ``(file, rows, bytes)`` summary rows.

    Writes the all-years hourly file, the ``focus_year`` hourly file, the
    all-years daily file and the ``focus_year`` generation-by-class file.
    ``rtordpa_overlay`` is kept in the hourly files only when non-zero in at
    least one row across all years; the decision is printed.
    """
    years = discover_years(bundle_dir)
    system = pd.concat([load_system_year(bundle_dir, y) for y in years], ignore_index=True)
    keep_rtordpa = bool((system[RTORDPA_SOURCE_COLUMN] != 0).any())
    nonzero_rows = int((system[RTORDPA_SOURCE_COLUMN] != 0).sum())
    print(
        f"{RTORDPA_SOURCE_COLUMN}: {'KEPT' if keep_rtordpa else 'DROPPED'} "
        f"({nonzero_rows} non-zero rows of {len(system)})"
    )

    span = {"first": years[0], "last": years[-1]}
    summary = []
    hourly = build_system_hourly(system, keep_rtordpa)
    summary.append(write_csv(hourly, out_dir / SYSTEM_SPAN_CSV_TEMPLATE.format(**span)))
    if focus_year in years:
        summary.append(write_csv(
            hourly[hourly["year"] == focus_year].reset_index(drop=True),
            out_dir / SYSTEM_YEAR_CSV_TEMPLATE.format(year=focus_year),
        ))
    else:
        print(f"focus year {focus_year} not in bundle; skipping its hourly extract")
    summary.append(write_csv(build_system_daily(system), out_dir / DAILY_SPAN_CSV_TEMPLATE.format(**span)))
    if focus_year in years:
        classes = load_class_year(bundle_dir, focus_year)
        summary.append(write_csv(
            build_generation_by_class(classes),
            out_dir / GENERATION_CSV_TEMPLATE.format(year=focus_year),
        ))
    return summary


def print_summary(summary: list[tuple[str, int, int]]) -> None:
    """Print the ``file | rows | bytes`` summary table."""
    name_width = max(len("file"), *(len(name) for name, _, _ in summary))
    print(f"{'file':<{name_width}}  {'rows':>9}  {'bytes':>12}")
    for name, rows, size in summary:
        print(f"{name:<{name_width}}  {rows:>9,}  {size:>12,}")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse the command line (``--bundle`` and ``--out`` directories)."""
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bundle", required=True, type=Path, help="keeper bundle directory")
    parser.add_argument("--out", required=True, type=Path, help="output directory for the CSVs")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point: convert the bundle and print the summary table."""
    args = parse_args(argv)
    summary = convert_bundle(args.bundle, args.out)
    print_summary(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
