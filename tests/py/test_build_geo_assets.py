"""Tests for scripts/build_geo_assets.py and the shipped public/geo assets.

Unit tests use three-vertex fixtures; the integration tests read the files
the build wrote into ``public/geo`` and check counts, properties, ring
validity and that ``index.json`` describes the files on disk.
"""

from __future__ import annotations

import json
import zipfile
from pathlib import Path

import pytest

import build_geo_assets as geo

REPO = Path(geo.__file__).resolve().parents[1]
GEO_DIR = REPO / "public" / "geo"

EXPECTED_STATES = 51
MIN_COUNTIES = 3000
MIN_COUNTRIES = 170
EXPECTED_ZONES = 7
EXPECTED_ZONE_NAMES = {"Houston", "North", "Northeast", "Panhandle", "South", "South_Central", "West"}
ERCOT_ZONE_COUNTY_COUNT = 214 - 4  # 214 ERCOT counties on ERCOT's map, 4 without a listed ZIP

UNIT_SQUARE = [[0.0, 0.0], [1.0, 0.0], [1.0, 1.0], [0.0, 1.0], [0.0, 0.0]]
RIGHT_SQUARE = [[1.0, 0.0], [2.0, 0.0], [2.0, 1.0], [1.0, 1.0], [1.0, 0.0]]
FAR_SQUARE = [[5.0, 5.0], [6.0, 5.0], [6.0, 6.0], [5.0, 6.0], [5.0, 5.0]]


def _polygon(ring: list[list[float]]) -> dict:
    return {"type": "Polygon", "coordinates": [ring]}


def _load(name: str) -> dict:
    return json.loads((GEO_DIR / name).read_text(encoding="utf-8"))


# --- geometry primitives --------------------------------------------------------


def test_signed_area_orientation() -> None:
    ccw = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    assert geo.signed_area(ccw) == pytest.approx(1.0)
    assert geo.signed_area(list(reversed(ccw))) == pytest.approx(-1.0)


def test_simplify_line_drops_collinear_point_and_keeps_ends() -> None:
    line = [(0.0, 0.0), (1.0, 0.0001), (2.0, 0.0)]
    assert geo.simplify_line(line, 0.01) == [(0.0, 0.0), (2.0, 0.0)]
    bend = [(0.0, 0.0), (1.0, 1.0), (2.0, 0.0)]
    assert geo.simplify_line(bend, 0.01) == bend


def test_simplify_line_zero_tolerance_is_identity() -> None:
    line = [(0.0, 0.0), (1.0, 0.0001), (2.0, 0.0)]
    assert geo.simplify_line(line, 0.0) == line


def test_point_in_ring() -> None:
    ring = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    assert geo.point_in_ring((0.5, 0.5), ring)
    assert not geo.point_in_ring((1.5, 0.5), ring)


def test_validate_geometry_flags_open_and_short_rings() -> None:
    assert geo.validate_geometry(_polygon(UNIT_SQUARE)) == []
    open_ring = {"type": "Polygon", "coordinates": [UNIT_SQUARE[:-1]]}
    assert any("not closed" in p for p in geo.validate_geometry(open_ring))
    short = {"type": "Polygon", "coordinates": [[[0, 0], [1, 0], [0, 0]]]}
    assert any("vertices" in p for p in geo.validate_geometry(short))
    assert geo.validate_geometry({"type": "Point", "coordinates": [0, 0]})


# --- dissolve ------------------------------------------------------------------


def test_dissolve_two_squares_sharing_an_edge_gives_one_rectangle() -> None:
    out = geo.dissolve([_polygon(UNIT_SQUARE), _polygon(RIGHT_SQUARE)])
    assert out["type"] == "Polygon"
    ring = out["coordinates"][0]
    assert ring[0] == ring[-1]
    vertices = {tuple(p) for p in ring}
    # The shared edge is gone; its end points stay as (collinear) boundary vertices.
    assert {(0.0, 0.0), (2.0, 0.0), (2.0, 1.0), (0.0, 1.0)} <= vertices
    assert vertices <= {(0.0, 0.0), (1.0, 0.0), (2.0, 0.0), (2.0, 1.0), (1.0, 1.0), (0.0, 1.0)}
    assert (0.5, 0.5) not in vertices
    assert geo.signed_area([tuple(p) for p in ring[:-1]]) == pytest.approx(2.0)


def test_dissolve_grid_area_equals_members() -> None:
    squares = [_polygon([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]) for x in range(2) for y in range(2)]
    out = geo.dissolve(squares)
    assert out["type"] == "Polygon"
    assert len(out["coordinates"]) == 1
    assert geo.signed_area([tuple(p) for p in out["coordinates"][0][:-1]]) == pytest.approx(4.0)


def test_dissolve_disjoint_squares_gives_multipolygon() -> None:
    out = geo.dissolve([_polygon(UNIT_SQUARE), _polygon(FAR_SQUARE)])
    assert out["type"] == "MultiPolygon"
    assert len(out["coordinates"]) == 2


def test_dissolve_ring_of_squares_keeps_the_hole() -> None:
    squares = []
    for x in range(3):
        for y in range(3):
            if (x, y) != (1, 1):
                squares.append(_polygon([[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1], [x, y]]))
    out = geo.dissolve(squares)
    assert out["type"] == "Polygon"
    assert len(out["coordinates"]) == 2  # outer ring + hole
    assert geo.validate_geometry(out) == []


def test_dissolve_keeps_touching_squares_separate() -> None:
    """Squares meeting only at a corner are two rings, not one pinched ring."""
    corner = [[1.0, 1.0], [2.0, 1.0], [2.0, 2.0], [1.0, 2.0], [1.0, 1.0]]
    out = geo.dissolve([_polygon(UNIT_SQUARE), _polygon(corner)])
    assert out["type"] == "MultiPolygon"
    assert len(out["coordinates"]) == 2
    assert geo.validate_geometry(out) == []


# --- topology-preserving simplification -----------------------------------------


def test_simplify_collection_keeps_shared_edge_identical() -> None:
    left = _polygon([[0, 0], [1, 0], [1, 0.5], [1.0001, 0.75], [1, 1], [0, 1], [0, 0]])
    right = _polygon([[1, 0], [2, 0], [2, 1], [1, 1], [1, 0.75], [1.0001, 0.5], [1, 0]])
    out, fallbacks = geo.simplify_collection([left, right], tolerance=0.01, decimals=4)
    assert fallbacks == 0
    merged = geo.dissolve(out)  # only works when the shared edge is bit-identical
    assert merged["type"] == "Polygon"
    for g in out:
        assert geo.validate_geometry(g) == []


# --- ZIP table and county assignment ----------------------------------------------


def _write_xlsx(path: Path, rows: list[list[str]]) -> Path:
    """Write a one-sheet workbook named ZipToZone using inline strings."""
    sheet_rows = []
    for r, row in enumerate(rows, start=1):
        cells = "".join(
            f'<c r="{chr(65 + c)}{r}" t="inlineStr"><is><t>{value}</t></is></c>'
            for c, value in enumerate(row)
            if value != ""
        )
        sheet_rows.append(f'<row r="{r}">{cells}</row>')
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rns = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    with zipfile.ZipFile(path, "w") as z:
        z.writestr(
            "xl/workbook.xml",
            f'<workbook xmlns="{ns}" xmlns:r="{rns}"><sheets>'
            f'<sheet name="{geo.ZIP_TO_ZONE_SHEET}" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        z.writestr(
            "xl/_rels/workbook.xml.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Target="worksheets/sheet1.xml" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>'
            "</Relationships>",
        )
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet xmlns="{ns}"><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>')
    return path


def test_parse_zip_to_zone_skips_titles_and_blank_rows(tmp_path: Path) -> None:
    book = _write_xlsx(
        tmp_path / "d.xlsx",
        [
            ["", "ZIP Code to Weather Zone Table", "", ""],
            ["", "Count", "Svc. Address ZIP Code", "Weather Zone Name", "Weather Zone Code"],
            ["", "1", "75001", "North Central", "NCENT"],
            ["", "", "79901", "Far West", "FWEST"],
            ["", "3", "abcde", "Far West", "FWEST"],
        ],
    )
    rows = geo.read_xlsx_sheet(book, geo.ZIP_TO_ZONE_SHEET)
    assert geo.parse_zip_to_zone(rows) == {"75001": "NCENT", "79901": "FWEST"}


def test_assign_weather_zones_majority_by_land_area() -> None:
    zip_to_zone = {"70001": "COAST", "70002": "SCENT"}
    rows = [
        {"GEOID_ZCTA5_20": "70001", "GEOID_COUNTY_20": "48001", "AREALAND_PART": "30"},
        {"GEOID_ZCTA5_20": "70002", "GEOID_COUNTY_20": "48001", "AREALAND_PART": "70"},
        {"GEOID_ZCTA5_20": "70001", "GEOID_COUNTY_20": "48003", "AREALAND_PART": "5"},
        {"GEOID_ZCTA5_20": "70001", "GEOID_COUNTY_20": "22001", "AREALAND_PART": "5"},  # not Texas
        {"GEOID_ZCTA5_20": "", "GEOID_COUNTY_20": "48005", "AREALAND_PART": "9"},  # no ZCTA
    ]
    assignment, weights = geo.assign_weather_zones(zip_to_zone, rows)
    assert assignment == {"48001": "SCENT", "48003": "COAST"}
    assert weights["48001"] == {"COAST": pytest.approx(0.3), "SCENT": pytest.approx(0.7)}


def test_carve_panhandle_uses_model_box() -> None:
    zones = {"a": "North", "b": "North", "c": "West"}
    centroids = {"a": (-101.8, 33.6), "b": (-98.0, 33.6), "c": (-101.8, 32.0)}
    assert geo.carve_panhandle(zones, centroids) == {"a": "Panhandle", "b": "North", "c": "West"}


def test_ercot_member_counties_fails_loud_on_unknown_name() -> None:
    counties = {"features": [{"properties": {"name": "Harris", "state": "TX", "fips": "48201"}}]}
    with pytest.raises(ValueError):
        geo.ercot_member_counties(counties)


def test_non_ercot_list_has_forty_unique_names() -> None:
    assert len(geo.NON_ERCOT_TX_COUNTIES) == geo.NON_ERCOT_TX_COUNTY_COUNT


# --- shipped assets ---------------------------------------------------------------


@pytest.fixture(scope="module")
def index() -> list[dict]:
    return json.loads((GEO_DIR / geo.INDEX_FILE).read_text(encoding="utf-8"))


def _features_valid(collection: dict) -> None:
    assert collection["type"] == "FeatureCollection"
    for feature in collection["features"]:
        assert geo.validate_geometry(feature["geometry"]) == [], feature["properties"]


def test_us_states_file() -> None:
    data = _load("us-states.geojson")
    assert len(data["features"]) == EXPECTED_STATES
    codes = {f["properties"]["code"] for f in data["features"]}
    assert {"TX", "DC", "AK", "HI"} <= codes and "PR" not in codes
    for f in data["features"]:
        assert set(f["properties"]) == {"name", "code", "fips"}
        assert len(f["properties"]["fips"]) == 2
    _features_valid(data)
    assert (GEO_DIR / "us-states.geojson").stat().st_size <= geo.STATES_MAX_BYTES


def test_world_countries_file() -> None:
    data = _load("world-countries.geojson")
    assert len(data["features"]) >= MIN_COUNTRIES
    by_a3 = {f["properties"]["iso_a3"]: f["properties"] for f in data["features"]}
    assert by_a3["USA"]["iso_a2"] == "US"
    assert by_a3["FRA"]["iso_a2"] == "FR"  # Natural Earth's -99 sentinel resolved via ISO_A2_EH
    for f in data["features"]:
        assert set(f["properties"]) == {"name", "iso_a2", "iso_a3"}
    _features_valid(data)
    assert (GEO_DIR / "world-countries.geojson").stat().st_size <= geo.WORLD_MAX_BYTES


def test_us_counties_file() -> None:
    data = _load("us-counties.geojson")
    assert len(data["features"]) >= MIN_COUNTIES
    fips = [f["properties"]["fips"] for f in data["features"]]
    assert len(set(fips)) == len(fips)
    texas = [f for f in data["features"] if f["properties"]["state"] == "TX"]
    assert len(texas) == 254
    for f in data["features"]:
        assert set(f["properties"]) == {"name", "state", "fips"}
        assert len(f["properties"]["fips"]) == 5
        assert len(f["properties"]["state"]) == 2
    _features_valid(data)
    assert (GEO_DIR / "us-counties.geojson").stat().st_size <= geo.COUNTIES_MAX_BYTES


def test_ercot_zones_file() -> None:
    data = _load("ercot-zones.geojson")
    assert len(data["features"]) == EXPECTED_ZONES
    assert {f["properties"]["zone"] for f in data["features"]} == EXPECTED_ZONE_NAMES
    counties = 0
    for f in data["features"]:
        props = f["properties"]
        assert {"zone", "counties", "weather_zones", "county_fips", "note"} <= set(props)
        assert props["counties"] == len(props["county_fips"]) > 0
        counties += props["counties"]
    assert counties == ERCOT_ZONE_COUNTY_COUNT
    _features_valid(data)


def test_ercot_zones_match_dataset_zone_values() -> None:
    """The zone names are exactly the ``zone`` values of the ERCOT datasets."""
    data = _load("ercot-zones.geojson")
    zones = {f["properties"]["zone"] for f in data["features"]}
    assert zones == set(geo.ERCOT_MODEL_ZONES)


def test_ercot_zone_counties_sidecar_is_consistent() -> None:
    zones = _load("ercot-zones.geojson")
    sidecar = _load("ercot-zone-counties.json")
    for f in zones["features"]:
        for fips in f["properties"]["county_fips"]:
            assert sidecar["counties"][fips]["zone"] == f["properties"]["zone"]
    assert not set(sidecar["unassigned"]) & set(sidecar["counties"])


def test_index_matches_files(index: list[dict]) -> None:
    ids = [e["id"] for e in index]
    assert ids == ["us-states", "world-countries", "us-counties", "ercot-zones"]
    for entry in index:
        path = GEO_DIR / entry["file"]
        assert path.exists(), entry["file"]
        assert entry["bytes"] == path.stat().st_size
        assert entry["kind"] == geo.INDEX_KIND
        data = json.loads(path.read_text(encoding="utf-8"))
        assert entry["features"] == len(data["features"])
        for key in entry["keyProps"]:
            assert all(key in f["properties"] for f in data["features"])
        assert entry["source"].startswith("https://")
        assert entry["license"]
