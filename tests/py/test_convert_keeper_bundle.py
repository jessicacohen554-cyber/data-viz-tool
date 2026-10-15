"""Tests for scripts/convert_keeper_bundle.py against a tiny synthetic bundle.

The synthetic bundle holds two zones × 48 hours for a non-leap year (2023,
hours 0–47 = Jan 1–2) and for the leap year 2024 (hours 1392–1439, which span
Feb 28 → Mar 1 and so exercise the Feb 29 skip). Values are arbitrary test
fixtures; the real datasets are never derived from them.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

pytest.importorskip("pyarrow")
pd = pytest.importorskip("pandas")

SCRIPT_PATH = Path(__file__).resolve().parents[2] / "scripts" / "convert_keeper_bundle.py"

ZONES = ("Houston", "West")
HOURS_PER_TEST_YEAR = 48
NON_LEAP_YEAR = 2023
NON_LEAP_FIRST_HOUR = 0
LEAP_YEAR = 2024
# Hour 1392 = 58 days × 24 = Feb 28 00:00 on the non-leap clock.
LEAP_FIRST_HOUR = 1392
CLASSES = ("CC_REGULAR", "COAL_LIGNITE", "wind", "OTHER")
# One fixture row carries unserved energy: zone West, offset 30 (day 2, 06:00).
SLACK_ZONE = "West"
SLACK_OFFSET = 30
SLACK_MW = 123.456


def load_module():
    """Import the script as a module without putting scripts/ on sys.path."""
    spec = importlib.util.spec_from_file_location("convert_keeper_bundle", SCRIPT_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def make_system_rows(year: int, first_hour: int) -> pd.DataFrame:
    """Two zones × 48 hours of deterministic system rows for ``year``."""
    rows = []
    for zone_index, zone in enumerate(ZONES):
        for offset in range(HOURS_PER_TEST_YEAR):
            hour = first_hour + offset
            rows.append({
                "year": year,
                "pass": "P1",
                "zone": zone,
                "hour": hour,
                "price": 10.0 + offset + 100 * zone_index,
                "slack": SLACK_MW if (zone == SLACK_ZONE and offset == SLACK_OFFSET) else 0.0,
                "dump": 0.0,
                "demand": 1000.0 + offset,
                "reserve_price": 2.0 * offset,
                "marginal_emission_rate": 0.4,
                "rtordpa_overlay": 0.0,
                "ordc_adder": -0.0,
            })
    return pd.DataFrame(rows)


def make_class_rows(year: int, first_hour: int, classes=CLASSES) -> pd.DataFrame:
    """One row per (class, hour) for the generation test file."""
    rows = []
    for klass in classes:
        for offset in range(HOURS_PER_TEST_YEAR):
            rows.append({
                "year": year,
                "pass": "P1",
                "klass": klass,
                "hour": first_hour + offset,
                "mw": float(offset),
            })
    return pd.DataFrame(rows)


@pytest.fixture
def bundle(tmp_path: Path) -> Path:
    """Write the synthetic bundle (2023 + 2024) and return its root."""
    hourly = tmp_path / "bundle" / "hourly"
    hourly.mkdir(parents=True)
    make_system_rows(NON_LEAP_YEAR, NON_LEAP_FIRST_HOUR).to_parquet(hourly / f"system_{NON_LEAP_YEAR}.parquet")
    make_system_rows(LEAP_YEAR, LEAP_FIRST_HOUR).to_parquet(hourly / f"system_{LEAP_YEAR}.parquet")
    make_class_rows(LEAP_YEAR, LEAP_FIRST_HOUR).to_parquet(hourly / f"class_hourly_{LEAP_YEAR}.parquet")
    return tmp_path / "bundle"


def test_hour_to_calendar_skips_feb_29():
    """Hour 1416 is Mar 1 00:00 even in a leap year; hour 1415 is Feb 28 23:00."""
    mod = load_module()
    assert mod.hour_to_calendar(LEAP_YEAR, 1415) == (LEAP_YEAR, 2, 28, 23)
    assert mod.hour_to_calendar(LEAP_YEAR, 1416) == (LEAP_YEAR, 3, 1, 0)
    assert mod.hour_to_calendar(NON_LEAP_YEAR, 0) == (NON_LEAP_YEAR, 1, 1, 0)
    assert mod.hour_to_calendar(NON_LEAP_YEAR, 8759) == (NON_LEAP_YEAR, 12, 31, 23)
    with pytest.raises(ValueError):
        mod.hour_to_calendar(NON_LEAP_YEAR, 8760)


def test_convert_bundle_row_counts_and_columns(bundle: Path, tmp_path: Path):
    """Row counts, output names and column order for the four CSVs."""
    mod = load_module()
    out = tmp_path / "out"
    summary = mod.convert_bundle(bundle, out, focus_year=LEAP_YEAR)
    names = [name for name, _, _ in summary]
    assert names == [
        "ercot-system-hourly-2023-2024.csv",
        "ercot-system-hourly-2024.csv",
        "ercot-system-daily-2023-2024.csv",
        "ercot-generation-by-class-hourly-2024.csv",
    ]

    hourly = pd.read_csv(out / names[0])
    assert len(hourly) == 2 * len(ZONES) * HOURS_PER_TEST_YEAR
    # rtordpa_overlay is all-zero in the fixture, so it must be dropped.
    assert list(hourly.columns) == [
        "timestamp", "year", "month", "day", "hour_of_day", "weekday", "zone",
        "price_usd_mwh", "demand_mw", "unserved_mw", "reserve_price_usd_mw",
        "marginal_emission_rate", "ordc_adder_usd_mwh",
    ]
    # The single non-zero slack row survives as unserved_mw (both years carry it).
    unserved = hourly[hourly["unserved_mw"] != 0]
    assert len(unserved) == 2
    assert set(unserved["zone"]) == {SLACK_ZONE}
    assert unserved["unserved_mw"].tolist() == [SLACK_MW, SLACK_MW]
    assert unserved["hour_of_day"].tolist() == [SLACK_OFFSET % 24] * 2
    assert hourly["timestamp"].iloc[0] == "2023-01-01T00:00"
    assert hourly["weekday"].iloc[0] == "Sun"  # 2023-01-01 was a Sunday
    # Negative zero must not leak into the CSV.
    assert "-0.0" not in (out / names[0]).read_text()

    hourly_2024 = pd.read_csv(out / names[1])
    assert len(hourly_2024) == len(ZONES) * HOURS_PER_TEST_YEAR
    assert set(hourly_2024["timestamp"].str[:10]) == {"2024-02-28", "2024-03-01"}
    assert "2024-02-29" not in set(hourly_2024["timestamp"].str[:10])
    mar_1 = hourly_2024[hourly_2024["timestamp"] == "2024-03-01T00:00"]
    assert mar_1["weekday"].unique().tolist() == ["Fri"]  # real calendar weekday

    daily = pd.read_csv(out / names[2])
    assert list(daily.columns) == list(mod.DAILY_COLUMNS)
    assert len(daily) == 2 * 2 * len(ZONES)  # 2 years × 2 days × 2 zones

    generation = pd.read_csv(out / names[3])
    assert list(generation.columns) == list(mod.GENERATION_COLUMNS)
    assert len(generation) == len(CLASSES) * HOURS_PER_TEST_YEAR


def test_daily_aggregation_math(bundle: Path, tmp_path: Path):
    """The daily measures equal hand-computed values for the fixture."""
    mod = load_module()
    out = tmp_path / "out"
    mod.convert_bundle(bundle, out, focus_year=LEAP_YEAR)
    daily = pd.read_csv(out / "ercot-system-daily-2023-2024.csv")
    row = daily[(daily["date"] == "2023-01-02") & (daily["zone"] == "West")].iloc[0]
    # Day 2 of the fixture covers offsets 24..47 for zone index 1 (price + 100).
    offsets = range(24, 48)
    assert row["avg_price_usd_mwh"] == pytest.approx(sum(110.0 + o for o in offsets) / 24, abs=1e-3)
    assert row["max_price_usd_mwh"] == pytest.approx(110.0 + 47, abs=1e-3)
    assert row["min_price_usd_mwh"] == pytest.approx(110.0 + 24, abs=1e-3)
    assert row["energy_mwh"] == pytest.approx(sum(1000.0 + o for o in offsets), abs=1e-3)
    assert row["unserved_mwh"] == pytest.approx(SLACK_MW, abs=1e-3)  # offset 30 is on day 2
    houston = daily[(daily["date"] == "2023-01-02") & (daily["zone"] == "Houston")].iloc[0]
    assert houston["unserved_mwh"] == 0.0
    assert row["peak_demand_mw"] == pytest.approx(1000.0 + 47, abs=1e-3)
    assert row["avg_reserve_price_usd_mw"] == pytest.approx(sum(2.0 * o for o in offsets) / 24, abs=1e-3)
    assert row["year"] == NON_LEAP_YEAR and row["month"] == 1 and row["weekday"] == "Mon"


def test_fuel_group_mapping():
    """Known classes map as documented; COAL_* falls back to Coal; unknown raises."""
    mod = load_module()
    assert mod.fuel_group_for_class("CC_REGULAR") == "Gas"
    assert mod.fuel_group_for_class("COAL_PRB") == "Coal"
    assert mod.fuel_group_for_class("COAL_BITUMINOUS") == "Coal"
    assert mod.fuel_group_for_class("wind") == "Wind"
    with pytest.raises(KeyError):
        mod.fuel_group_for_class("fusion")


def test_generation_fails_on_unknown_class(tmp_path: Path):
    """An unmapped class in class_hourly makes the generation build raise."""
    mod = load_module()
    frame = make_class_rows(LEAP_YEAR, LEAP_FIRST_HOUR, classes=("wind", "fusion"))
    with pytest.raises(KeyError, match="fusion"):
        mod.build_generation_by_class(frame)
