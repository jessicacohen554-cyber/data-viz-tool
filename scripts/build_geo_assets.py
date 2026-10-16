"""Build the choropleth GeoJSON assets under ``public/geo/``.

Four boundary files plus an ``index.json`` catalog, every one derived from a
public-domain source whose URL and licence are recorded in
``public/geo/README.md`` and in the index:

``us-states.geojson``
    50 states + DC from the US Census 2010 cartographic boundary file
    (1:20m) as converted to GeoJSON by eric.clst.org; Puerto Rico dropped;
    properties ``name``, ``code`` (USPS), ``fips``.
``world-countries.geojson``
    Natural Earth 1:110m admin-0 countries (nvkelso/natural-earth-vector);
    properties ``name``, ``iso_a2``, ``iso_a3``.
``us-counties.geojson``
    Every county of the 50 states + DC from the Census 2010 cartographic
    boundary file as redistributed by plotly/datasets; properties ``name``,
    ``state`` (USPS), ``fips`` (5 digits).
``ercot-zones.geojson``
    The seven ERCOT model zones of the market-simulator datasets (Houston,
    North, Northeast, Panhandle, South, South_Central, West) dissolved from
    Texas county polygons.  The county -> zone assignment is DERIVED, never
    guessed, in three documented steps (see :func:`assign_weather_zones`,
    :func:`carve_panhandle` and the README):

    1. Membership: ERCOT's official County Map (media kit) shades the 40
       Texas counties outside ERCOT grey; they are listed verbatim in
       ``NON_ERCOT_TX_COUNTIES`` and excluded.  (ERCOT's ZIP table below
       also maps ZIPs in non-ERCOT areas such as Beaumont, so it cannot
       decide membership.)
    2. Weather zone: ERCOT's official ZIP-code -> weather-zone table (Load
       Profiling Guide Appendix D, "ZipToZone" sheet) joined to the Census
       2020 ZCTA -> county relationship file gives every county its ERCOT
       weather zone by land-area-weighted majority.  An ERCOT county with no
       listed ZIP at all gets no zone and is reported, never guessed.
    3. The eight weather zones collapse onto six model zones with the
       crosswalk the model itself documents (``WEATHER_ZONE_TO_MODEL_ZONE``).
    4. The Panhandle zone, which no ERCOT weather zone feeds, is the model's
       own geographic rule (centroid north of ``PANHANDLE_MIN_LAT`` and west
       of ``PANHANDLE_MAX_LON``) applied to the ERCOT counties.

Geometry handling is pure Python: a topology-preserving Douglas-Peucker
(shared arcs between neighbouring polygons are simplified exactly once, so
no slivers open up and the zone dissolve can remove shared edges exactly),
and a dissolve that drops every edge two member rings share and re-chains
the rest into rings.

stdlib only.  Run::

    python scripts/build_geo_assets.py [--cache DIR] [--out DIR] [--offline]

``--cache`` holds the downloaded sources (re-used when present, so the build
is reproducible offline once primed); ``--offline`` refuses to download.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
import ssl
import sys
import tempfile
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEFAULT_OUT_DIR = REPO / "public" / "geo"
DEFAULT_CACHE_DIR = Path(tempfile.gettempdir()) / "data-viz-tool-geo-cache"

RETRIEVED_DATE = "2026-10-16"
INDEX_FILE = "index.json"
INDEX_KIND = "choropleth"
JSON_SEPARATORS = (",", ":")
JSON_INDENT = 2
# Output coordinate precision: 4 decimals is ~11 m, far below the 1:20m
# (states/counties) and 1:110m (world) source resolution.
COORD_DECIMALS = 4
# Douglas-Peucker tolerances in degrees (planar, applied to lon/lat).
# 0 = no vertex removal (rounding only).
STATES_TOLERANCE_DEG = 0.025
WORLD_TOLERANCE_DEG = 0.0
COUNTIES_TOLERANCE_DEG = 0.004
# Size targets (bytes) checked after writing; a miss is a loud failure.
STATES_MAX_BYTES = 150 * 1024
WORLD_MAX_BYTES = 400 * 1024
COUNTIES_MAX_BYTES = 2_500 * 1024
MIN_RING_VERTICES = 4  # three distinct vertices + closing vertex
DOWNLOAD_TIMEOUT_S = 120
USER_AGENT = "data-viz-tool build_geo_assets (stdlib urllib)"
MISSING_ISO = "-99"  # Natural Earth's "no code" sentinel
PUERTO_RICO_FIPS = "72"
TEXAS_FIPS = "48"
# Relative tolerance for the dissolve area check (sum of member areas must
# equal the dissolved area).
AREA_CHECK_REL_TOL = 1e-6
EXIT_USAGE = 2


@dataclass(frozen=True)
class Source:
    """One downloadable input: where it comes from and under which licence."""

    url: str
    cache_name: str
    license: str
    label: str


SOURCES: dict[str, Source] = {
    "states": Source(
        url="https://eric.clst.org/assets/wiki/uploads/Stuff/gz_2010_us_040_00_20m.json",
        cache_name="gz_2010_us_040_00_20m.json",
        license=(
            "Public domain (US Census Bureau 2010 cartographic boundary file, "
            "1:20m, converted to GeoJSON by eric.clst.org; a work of the US "
            "Government is not subject to copyright)"
        ),
        label="US states",
    ),
    "world": Source(
        url=(
            "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/"
            "master/geojson/ne_110m_admin_0_countries.geojson"
        ),
        cache_name="ne_110m_admin_0_countries.geojson",
        license="Public domain (Natural Earth, naturalearthdata.com/about/terms-of-use)",
        label="World countries",
    ),
    "counties": Source(
        url="https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json",
        cache_name="geojson-counties-fips.json",
        license=(
            "Public domain geometry (US Census Bureau 2010 cartographic boundary "
            "file) redistributed by plotly/datasets under the MIT License"
        ),
        label="US counties",
    ),
    "ercot_zip_to_zone": Source(
        url=(
            "https://www.ercot.com/files/docs/2024/04/30/"
            "Appendix_D_Profile_Decision_Tree_050124.xlsx"
        ),
        cache_name="ERCOT_LPG_Appendix_D_Profile_Decision_Tree_050124.xlsx",
        license=(
            "ERCOT Load Profiling Guide Appendix D (ERCOT market rules, "
            "publicly posted); only the ZIP->weather-zone facts are used, the "
            "workbook itself is not redistributed"
        ),
        label="ERCOT ZIP code to weather zone table",
    ),
    "zcta_to_county": Source(
        url=(
            "https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/"
            "tab20_zcta520_county20_natl.txt"
        ),
        cache_name="tab20_zcta520_county20_natl.txt",
        license="Public domain (US Census Bureau 2020 ZCTA-to-county relationship file)",
        label="Census ZCTA to county relationship",
    ),
}

# ERCOT weather-zone codes as the Appendix D "ZipToZone" sheet spells them.
ERCOT_WEATHER_ZONES: tuple[str, ...] = (
    "COAST",
    "EAST",
    "FWEST",
    "NCENT",
    "NORTH",
    "SCENT",
    "SOUTH",
    "WEST",
)
# Weather zone -> model transmission zone.  Mirrors market-simulator
# scripts/data/derive_load_shares.py:81-90 (``WZ_TO_ZONE``) and
# src/market_sim/config/iso_configs.py:166-168; the Appendix D codes differ
# from that script's NP6-345 spellings (FAR_WEST==FWEST, NORTH_C==NCENT,
# SOUTH_C==SCENT, SOUTHERN==SOUTH).
WEATHER_ZONE_TO_MODEL_ZONE: dict[str, str] = {
    "COAST": "Houston",
    "NCENT": "North",
    "EAST": "Northeast",
    "NORTH": "North",
    "SCENT": "South_Central",
    "SOUTH": "South",
    "FWEST": "West",
    "WEST": "West",
}
# Model zone order of the datasets (iso_configs.py:192-200).
ERCOT_MODEL_ZONES: tuple[str, ...] = (
    "West",
    "Panhandle",
    "North",
    "Northeast",
    "Houston",
    "South_Central",
    "South",
)
PANHANDLE_ZONE = "Panhandle"
# The model's Panhandle rule (market-simulator
# src/market_sim/data/zone_assignment.py:771-777): a located ERCOT plant with
# lon < -99.5 and lat >= 33.5 sits in the Panhandle zone behind the PNHNDL
# export limit.  Applied here to county centroids.
PANHANDLE_MIN_LAT = 33.5
PANHANDLE_MAX_LON = -99.5

# The ERCOT County Map (ERCOT media kit, "ERCOT County Map",
# https://www.ercot.com/files/assets/2022/12/13/ERCOT-Maps_Area-by-county.jpg,
# linked from https://ercot.com/news/mediakit/maps, read 2026-10-16) names
# every Texas county and shades the ones outside ERCOT grey.  These are the
# 40 grey counties, transcribed from that image; every other Texas county
# (214) is shown as an ERCOT county.
ERCOT_COUNTY_MAP_URL = "https://www.ercot.com/files/assets/2022/12/13/ERCOT-Maps_Area-by-county.jpg"
NON_ERCOT_TX_COUNTIES: frozenset[str] = frozenset(
    {
        # Panhandle / South Plains (SPP: Southwestern Public Service)
        "Dallam", "Sherman", "Hansford", "Ochiltree", "Lipscomb",
        "Hartley", "Moore", "Hutchinson", "Hemphill",
        "Bailey", "Lamb", "Cochran", "Hockley", "Yoakum", "Terry", "Gaines",
        # Far west (WECC: El Paso Electric)
        "El Paso", "Hudspeth",
        # Northeast / east Texas (SPP: SWEPCO)
        "Bowie", "Cass", "Morris", "Marion", "Harrison", "Gregg", "Upshur",
        "Camp", "Panola", "Shelby", "San Augustine", "Sabine",
        # Southeast Texas (MISO: Entergy Texas)
        "Trinity", "Polk", "San Jacinto", "Tyler", "Jasper", "Newton",
        "Hardin", "Liberty", "Jefferson", "Orange",
    }
)
NON_ERCOT_TX_COUNTY_COUNT = 40

ZIP_TO_ZONE_SHEET = "ZipToZone"
ZIP_COLUMN = "C"
ZONE_CODE_COLUMN = "E"
_ZIP_RE = re.compile(r"^\d{5}$")

# FIPS state code -> USPS abbreviation (50 states + DC + PR).
STATE_FIPS_TO_USPS: dict[str, str] = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO",
    "09": "CT", "10": "DE", "11": "DC", "12": "FL", "13": "GA", "15": "HI",
    "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN",
    "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV", "33": "NH",
    "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD",
    "47": "TN", "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA",
    "54": "WV", "55": "WI", "56": "WY", "72": "PR",
}

Point = tuple[float, float]
Ring = list[Point]

_XLSX_NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
_XLSX_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"


# --- download -----------------------------------------------------------------


def fetch(source: Source, cache_dir: Path, offline: bool = False) -> Path:
    """Return the cached copy of ``source``, downloading it when absent."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    dest = cache_dir / source.cache_name
    if dest.exists() and dest.stat().st_size > 0:
        return dest
    if offline:
        raise FileNotFoundError(f"{dest} missing and --offline given ({source.url})")
    request = urllib.request.Request(source.url, headers={"User-Agent": USER_AGENT})
    context = ssl.create_default_context()
    with urllib.request.urlopen(request, timeout=DOWNLOAD_TIMEOUT_S, context=context) as resp:
        data = resp.read()
    if not data:
        raise RuntimeError(f"empty download: {source.url}")
    dest.write_bytes(data)
    return dest


# --- xlsx (stdlib) --------------------------------------------------------------


def read_xlsx_sheet(path: Path, sheet_name: str) -> list[dict[str, str]]:
    """Return the rows of one worksheet as ``{column letter: cell text}`` dicts.

    Minimal OOXML reader: shared strings, inline strings and plain values;
    formulas are read through their cached value.  Empty cells are omitted.
    """
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            text_tag = f"{{{_XLSX_NS['m']}}}t"
            for si in root.findall("m:si", _XLSX_NS):
                shared.append("".join(t.text or "" for t in si.iter(text_tag)))
        workbook = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        targets = {
            rel.get("Id"): rel.get("Target")
            for rel in rels.findall(f"{{{_XLSX_REL_NS}}}Relationship")
        }
        sheets = workbook.find("m:sheets", _XLSX_NS)
        if sheets is None:
            raise ValueError(f"{path}: no <sheets> element")
        for sheet in sheets:
            if (sheet.get("name") or "").strip() != sheet_name:
                continue
            target = targets[sheet.get(f"{{{_XLSX_NS['r']}}}id")]
            member = target if target.startswith("xl/") else "xl/" + target.lstrip("/")
            return _parse_sheet_xml(z.read(member), shared)
    raise KeyError(f"{path}: no sheet named {sheet_name!r}")


def _parse_sheet_xml(xml_bytes: bytes, shared: list[str]) -> list[dict[str, str]]:
    """Parse one ``xl/worksheets/sheetN.xml`` payload into row dicts."""
    root = ET.fromstring(xml_bytes)
    text_tag = f"{{{_XLSX_NS['m']}}}t"
    rows: list[dict[str, str]] = []
    for row in root.iter(f"{{{_XLSX_NS['m']}}}row"):
        cells: dict[str, str] = {}
        for cell in row.findall("m:c", _XLSX_NS):
            ref = cell.get("r") or ""
            column = re.match(r"[A-Z]+", ref)
            if column is None:
                continue
            value = cell.find("m:v", _XLSX_NS)
            if value is not None and value.text is not None:
                text = shared[int(value.text)] if cell.get("t") == "s" else value.text
            else:
                inline = cell.find("m:is", _XLSX_NS)
                text = "".join(t.text or "" for t in inline.iter(text_tag)) if inline is not None else ""
            if text != "":
                cells[column.group(0)] = text
        if cells:
            rows.append(cells)
    return rows


def parse_zip_to_zone(rows: list[dict[str, str]]) -> dict[str, str]:
    """Return ``{zip5: weather-zone code}`` from the Appendix D ZipToZone rows.

    A data row has a five-digit ZIP in column C and a known weather-zone code
    in column E; titles, notes and blank rows are skipped.
    """
    table: dict[str, str] = {}
    for row in rows:
        zip5 = row.get(ZIP_COLUMN, "").strip()
        code = row.get(ZONE_CODE_COLUMN, "").strip()
        if _ZIP_RE.match(zip5) and code in ERCOT_WEATHER_ZONES:
            table[zip5] = code
    if not table:
        raise ValueError("no ZIP -> weather zone rows found")
    return table


# --- county -> weather zone ----------------------------------------------------


def read_zcta_county_rows(path: Path) -> list[dict[str, str]]:
    """Read the Census ZCTA-to-county relationship file (pipe-delimited)."""
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle, delimiter="|"))


def assign_weather_zones(
    zip_to_zone: dict[str, str],
    zcta_rows: list[dict[str, str]],
    state_fips: str = TEXAS_FIPS,
) -> tuple[dict[str, str], dict[str, dict[str, float]]]:
    """Give each county of ``state_fips`` the ERCOT weather zone of its ZIPs.

    Every (ZCTA, county) part whose ZCTA is in ERCOT's ZIP table votes with its
    land area (``AREALAND_PART``) for that ZIP's weather zone; the county takes
    the zone with the largest area.  Returns ``(assignment, weights)`` where
    ``weights[fips]`` holds the per-zone land-area shares (0..1) for
    transparency.  Counties with no ERCOT ZIP are absent: they are outside
    ERCOT.
    """
    votes: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for row in zcta_rows:
        zcta = row.get("GEOID_ZCTA5_20", "")
        fips = row.get("GEOID_COUNTY_20", "")
        if not zcta or not fips.startswith(state_fips) or zcta not in zip_to_zone:
            continue
        votes[fips][zip_to_zone[zcta]] += float(row.get("AREALAND_PART") or 0.0)
    assignment: dict[str, str] = {}
    weights: dict[str, dict[str, float]] = {}
    for fips, by_zone in sorted(votes.items()):
        total = sum(by_zone.values())
        if total <= 0:
            continue
        winner = max(sorted(by_zone), key=lambda zone: by_zone[zone])
        assignment[fips] = winner
        weights[fips] = {zone: area / total for zone, area in sorted(by_zone.items())}
    if not assignment:
        raise ValueError("no county received a weather zone")
    return assignment, weights


def ercot_member_counties(counties: dict) -> set[str]:
    """FIPS codes of the Texas counties ERCOT's County Map shows inside ERCOT.

    Resolves ``NON_ERCOT_TX_COUNTIES`` by name against the counties
    collection (county names are unique within Texas) and fails loudly when
    a listed name does not resolve, so a typo cannot silently widen ERCOT.
    """
    texas = {f["properties"]["name"]: f["properties"]["fips"] for f in counties["features"] if f["properties"]["state"] == "TX"}
    unknown = sorted(NON_ERCOT_TX_COUNTIES - set(texas))
    if unknown or len(NON_ERCOT_TX_COUNTIES) != NON_ERCOT_TX_COUNTY_COUNT:
        raise ValueError(f"NON_ERCOT_TX_COUNTIES does not match the counties file: {unknown}")
    return {fips for name, fips in texas.items() if name not in NON_ERCOT_TX_COUNTIES}


def carve_panhandle(
    model_zone: dict[str, str], centroids: dict[str, Point]
) -> dict[str, str]:
    """Move counties inside the model's Panhandle box to the Panhandle zone.

    The box is the rule ``zone_assignment._ercot_zone`` applies to plant
    coordinates (lon < ``PANHANDLE_MAX_LON`` and lat >= ``PANHANDLE_MIN_LAT``);
    here it is evaluated on each ERCOT county's centroid.
    """
    out = dict(model_zone)
    for fips in model_zone:
        lon, lat = centroids[fips]
        if lon < PANHANDLE_MAX_LON and lat >= PANHANDLE_MIN_LAT:
            out[fips] = PANHANDLE_ZONE
    return out


# --- geometry: primitives ------------------------------------------------------


def signed_area(ring: Ring) -> float:
    """Shoelace area of a ring (open or closed); positive = counter-clockwise."""
    area = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        area += x0 * y1 - x1 * y0
    return area / 2.0


def ring_centroid(ring: Ring) -> Point:
    """Area centroid of a ring; falls back to the vertex mean when degenerate."""
    area = 0.0
    cx = cy = 0.0
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        cross = x0 * y1 - x1 * y0
        area += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    if abs(area) < 1e-12:
        return (sum(p[0] for p in ring) / n, sum(p[1] for p in ring) / n)
    return (cx / (3.0 * area), cy / (3.0 * area))


def geometry_rings(geometry: dict) -> list[Ring]:
    """Every ring (outer and hole) of a Polygon/MultiPolygon as point tuples."""
    if geometry["type"] == "Polygon":
        polygons = [geometry["coordinates"]]
    elif geometry["type"] == "MultiPolygon":
        polygons = geometry["coordinates"]
    else:
        raise ValueError(f"unsupported geometry type {geometry['type']}")
    return [[(float(x), float(y)) for x, y in ring] for poly in polygons for ring in poly]


def geometry_centroid(geometry: dict) -> Point:
    """Centroid of the largest outer ring of a Polygon/MultiPolygon."""
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    outers = [[(float(x), float(y)) for x, y in poly[0]] for poly in polygons]
    largest = max(outers, key=lambda ring: abs(signed_area(ring)))
    return ring_centroid(largest)


def point_in_ring(point: Point, ring: Ring) -> bool:
    """Ray-casting point-in-polygon test against one ring."""
    x, y = point
    inside = False
    n = len(ring)
    for i in range(n):
        x0, y0 = ring[i]
        x1, y1 = ring[(i + 1) % n]
        if (y0 > y) != (y1 > y):
            x_cross = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
            if x < x_cross:
                inside = not inside
    return inside


def _perpendicular_distance(point: Point, start: Point, end: Point) -> float:
    """Distance from ``point`` to the segment ``start``-``end`` (planar)."""
    x, y = point
    x1, y1 = start
    x2, y2 = end
    dx, dy = x2 - x1, y2 - y1
    if dx == 0.0 and dy == 0.0:
        return math.hypot(x - x1, y - y1)
    t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify_line(points: list[Point], tolerance: float) -> list[Point]:
    """Douglas-Peucker on an open polyline; both end points are always kept."""
    n = len(points)
    if n < 3 or tolerance <= 0.0:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        best = -1.0
        best_index = i
        for k in range(i + 1, j):
            d = _perpendicular_distance(points[k], points[i], points[j])
            if d > best:
                best, best_index = d, k
        if best > tolerance:
            keep[best_index] = True
            stack.append((i, best_index))
            stack.append((best_index, j))
    return [p for p, k in zip(points, keep) if k]


def simplify_closed_ring(points: list[Point], tolerance: float) -> list[Point]:
    """Douglas-Peucker on a closed ring (open list): split at the vertex farthest from ``points[0]``."""
    if len(points) < 4 or tolerance <= 0.0:
        return list(points)
    x0, y0 = points[0]
    far = max(range(1, len(points)), key=lambda k: (points[k][0] - x0) ** 2 + (points[k][1] - y0) ** 2)
    first = simplify_line(points[: far + 1], tolerance)
    second = simplify_line(points[far:] + [points[0]], tolerance)
    return first[:-1] + second[:-1]


def _open_ring(ring: Ring) -> Ring:
    """Drop the closing vertex and consecutive duplicates."""
    out: Ring = []
    for p in ring:
        if not out or out[-1] != p:
            out.append(p)
    if len(out) > 1 and out[0] == out[-1]:
        out.pop()
    return out


def _round_point(p: Point, decimals: int) -> Point:
    return (round(p[0], decimals), round(p[1], decimals))


# --- geometry: topology-preserving simplification ------------------------------


def simplify_collection(
    geometries: list[dict], tolerance: float, decimals: int = COORD_DECIMALS
) -> tuple[list[dict], int]:
    """Simplify every geometry so that shared boundaries stay identical.

    All rings are decomposed into arcs between *junctions* (vertices whose
    neighbours differ between the rings that contain them, i.e. where three
    or more polygons meet or a shared edge starts).  Each unique arc is
    simplified with Douglas-Peucker once and rounded, then the rings are
    rebuilt from the arcs, so two neighbours always share the exact same
    vertex sequence.  Rings that would collapse below three distinct vertices
    keep their original (rounded) vertices; the count of such fallbacks is
    returned alongside the new geometries.
    """
    opened: list[list[list[Ring]]] = []  # geometry -> polygon -> rings (open)
    for geometry in geometries:
        polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        opened.append([[_open_ring([(float(x), float(y)) for x, y in ring]) for ring in poly] for poly in polys])

    seen: dict[Point, frozenset[Point]] = {}
    junctions: set[Point] = set()
    for polys in opened:
        for poly in polys:
            for ring in poly:
                n = len(ring)
                for i, v in enumerate(ring):
                    neighbours = frozenset((ring[i - 1], ring[(i + 1) % n]))
                    previous = seen.get(v)
                    if previous is None:
                        seen[v] = neighbours
                    elif previous != neighbours:
                        junctions.add(v)

    arc_cache: dict[tuple[Point, ...], list[Point]] = {}

    def simplified_arc(arc: list[Point]) -> list[Point]:
        key = tuple(arc)
        hit = arc_cache.get(key)
        if hit is not None:
            return hit
        reverse_hit = arc_cache.get(tuple(reversed(arc)))
        if reverse_hit is not None:
            return list(reversed(reverse_hit))
        result = [_round_point(p, decimals) for p in simplify_line(arc, tolerance)]
        arc_cache[key] = result
        return result

    fallbacks = 0
    out_geometries: list[dict] = []
    for polys in opened:
        out_polys: list[list[list[list[float]]]] = []
        for poly in polys:
            out_rings: list[list[list[float]]] = []
            for ring in poly:
                cut = [i for i, v in enumerate(ring) if v in junctions]
                if cut:
                    rotated = ring[cut[0] :] + ring[: cut[0]]
                    cut = [i - cut[0] for i in cut]
                    bounds = cut + [len(rotated)]
                    rebuilt: list[Point] = []
                    for a, b in zip(bounds, bounds[1:]):
                        segment = rotated[a : b + 1] if b < len(rotated) else rotated[a:] + [rotated[0]]
                        rebuilt.extend(simplified_arc(segment)[:-1])
                else:
                    rebuilt = [_round_point(p, decimals) for p in simplify_closed_ring(ring, tolerance)]
                rebuilt = _open_ring(rebuilt)
                if len(rebuilt) < MIN_RING_VERTICES - 1:
                    fallbacks += 1
                    rebuilt = _open_ring([_round_point(p, decimals) for p in ring])
                    if len(rebuilt) < MIN_RING_VERTICES - 1:
                        continue
                out_rings.append([[x, y] for x, y in rebuilt] + [[rebuilt[0][0], rebuilt[0][1]]])
            if out_rings:
                out_polys.append(out_rings)
        if not out_polys:
            raise ValueError("a geometry lost every ring during simplification")
        if len(out_polys) == 1:
            out_geometries.append({"type": "Polygon", "coordinates": out_polys[0]})
        else:
            out_geometries.append({"type": "MultiPolygon", "coordinates": out_polys})
    return out_geometries, fallbacks


# --- geometry: dissolve ----------------------------------------------------------


def dissolve(geometries: list[dict]) -> dict:
    """Union polygons that share exact edges by removing every shared edge.

    Outer rings are oriented counter-clockwise and holes clockwise; each
    undirected edge used by two rings is interior and dropped; the remaining
    directed edges are chained into rings (at a pinch vertex the left-most
    turn is taken, which keeps touching parts as separate rings).  Rings with
    positive area become outer rings, negative ones holes of the outer ring
    that contains them.  The result's area must equal the members' total
    area (checked to ``AREA_CHECK_REL_TOL``), which fails loudly when the
    inputs do not share identical edges.
    """
    directed: list[tuple[Point, Point]] = []
    undirected: Counter[tuple[Point, Point]] = Counter()
    expected_area = 0.0
    for geometry in geometries:
        polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        for poly in polys:
            for index, raw in enumerate(poly):
                ring = _open_ring([(float(x), float(y)) for x, y in raw])
                area = signed_area(ring)
                if (index == 0 and area < 0) or (index > 0 and area > 0):
                    ring.reverse()
                    area = -area
                expected_area += area
                n = len(ring)
                for i in range(n):
                    a, b = ring[i], ring[(i + 1) % n]
                    directed.append((a, b))
                    undirected[(a, b) if a <= b else (b, a)] += 1

    boundary = [(a, b) for a, b in directed if undirected[(a, b) if a <= b else (b, a)] == 1]
    outgoing: dict[Point, list[Point]] = defaultdict(list)
    for a, b in boundary:
        outgoing[a].append(b)
    used: set[tuple[Point, Point]] = set()
    rings: list[Ring] = []
    for start in boundary:
        if start in used:
            continue
        ring: Ring = [start[0]]
        current = start
        while True:
            used.add(current)
            ring.append(current[1])
            if current[1] == start[0]:
                break
            candidates = [b for b in outgoing[current[1]] if (current[1], b) not in used]
            if not candidates:
                raise ValueError("dissolve: boundary does not close")
            if len(candidates) == 1:
                nxt = candidates[0]
            else:
                nxt = _leftmost_turn(current, candidates)
            current = (current[1], nxt)
        rings.append(ring[:-1])

    outers = [r for r in rings if signed_area(r) > 0]
    holes = [r for r in rings if signed_area(r) < 0]
    polygons: list[list[Ring]] = [[outer] for outer in outers]
    for hole in holes:
        probe = hole[0]
        for poly in polygons:
            if point_in_ring(probe, poly[0]):
                poly.append(hole)
                break
        else:
            raise ValueError("dissolve: hole outside every outer ring")
    got_area = sum(signed_area(r) for r in rings)
    if abs(got_area - expected_area) > AREA_CHECK_REL_TOL * max(abs(expected_area), 1e-12):
        raise ValueError(f"dissolve: area {got_area} != members' {expected_area}")
    coords = [[[[x, y] for x, y in ring] + [[ring[0][0], ring[0][1]]] for ring in poly] for poly in polygons]
    if len(coords) == 1:
        return {"type": "Polygon", "coordinates": coords[0]}
    return {"type": "MultiPolygon", "coordinates": coords}


def _leftmost_turn(current: tuple[Point, Point], candidates: list[Point]) -> Point:
    """Pick the candidate making the most counter-clockwise turn from ``current``."""
    (ax, ay), (bx, by) = current
    dx, dy = bx - ax, by - ay

    def angle(c: Point) -> float:
        vx, vy = c[0] - bx, c[1] - by
        return math.atan2(dx * vy - dy * vx, dx * vx + dy * vy)

    return max(candidates, key=angle)


# --- validation ----------------------------------------------------------------


def validate_geometry(geometry: dict) -> list[str]:
    """Return the problems of a Polygon/MultiPolygon (empty list = valid)."""
    problems: list[str] = []
    if geometry.get("type") == "Polygon":
        polys = [geometry["coordinates"]]
    elif geometry.get("type") == "MultiPolygon":
        polys = geometry["coordinates"]
    else:
        return [f"unsupported type {geometry.get('type')!r}"]
    if not polys:
        return ["no polygons"]
    for poly in polys:
        if not poly:
            problems.append("polygon without rings")
            continue
        for ring in poly:
            if len(ring) < MIN_RING_VERTICES:
                problems.append(f"ring with {len(ring)} vertices")
            if ring[0] != ring[-1]:
                problems.append("ring not closed")
            for x, y in ring:
                if not (-180.0 <= x <= 180.0 and -90.0 <= y <= 90.0) or math.isnan(x) or math.isnan(y):
                    problems.append(f"coordinate out of range ({x}, {y})")
                    break
    return problems


# --- builders ------------------------------------------------------------------


def _feature(properties: dict, geometry: dict) -> dict:
    return {"type": "Feature", "properties": properties, "geometry": geometry}


def _collection(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


def build_states(raw: dict) -> dict:
    """50 states + DC with ``name``/``code``/``fips`` from the Census 20m file."""
    kept = [f for f in raw["features"] if f["properties"]["STATE"] != PUERTO_RICO_FIPS]
    kept.sort(key=lambda f: f["properties"]["STATE"])
    geometries, fallbacks = simplify_collection([f["geometry"] for f in kept], STATES_TOLERANCE_DEG)
    features = [
        _feature(
            {
                "name": f["properties"]["NAME"],
                "code": STATE_FIPS_TO_USPS[f["properties"]["STATE"]],
                "fips": f["properties"]["STATE"],
            },
            g,
        )
        for f, g in zip(kept, geometries)
    ]
    _log(f"states: {len(features)} features, {fallbacks} ring fallbacks")
    return _collection(features)


def _iso_or_none(properties: dict, key: str) -> str | None:
    """Natural Earth ISO code with the ``_EH`` fallback; ``None`` when absent."""
    for candidate in (properties.get(key), properties.get(key + "_EH")):
        if candidate and candidate != MISSING_ISO:
            return candidate
    return None


def build_world(raw: dict) -> dict:
    """Countries with ``name``/``iso_a2``/``iso_a3`` from Natural Earth 110m."""
    kept = sorted(raw["features"], key=lambda f: f["properties"]["NAME"])
    geometries, fallbacks = simplify_collection([f["geometry"] for f in kept], WORLD_TOLERANCE_DEG)
    features = [
        _feature(
            {
                "name": f["properties"]["NAME"],
                "iso_a2": _iso_or_none(f["properties"], "ISO_A2"),
                "iso_a3": _iso_or_none(f["properties"], "ISO_A3"),
            },
            g,
        )
        for f, g in zip(kept, geometries)
    ]
    _log(f"world: {len(features)} features, {fallbacks} ring fallbacks")
    return _collection(features)


def build_counties(raw: dict) -> dict:
    """Counties of the 50 states + DC with ``name``/``state``/``fips``."""
    kept = [f for f in raw["features"] if f["properties"]["STATE"] != PUERTO_RICO_FIPS]
    kept.sort(key=lambda f: f["properties"]["STATE"] + f["properties"]["COUNTY"])
    geometries, fallbacks = simplify_collection([f["geometry"] for f in kept], COUNTIES_TOLERANCE_DEG)
    features = [
        _feature(
            {
                "name": f["properties"]["NAME"],
                "state": STATE_FIPS_TO_USPS[f["properties"]["STATE"]],
                "fips": f["properties"]["STATE"] + f["properties"]["COUNTY"],
            },
            g,
        )
        for f, g in zip(kept, geometries)
    ]
    _log(f"counties: {len(features)} features, {fallbacks} ring fallbacks")
    return _collection(features)


def build_ercot_zones(
    counties: dict, weather_zone_of: dict[str, str], members: set[str]
) -> tuple[dict, dict[str, str], list[str]]:
    """Dissolve Texas county polygons into the seven ERCOT model zones.

    ``weather_zone_of`` maps county FIPS -> ERCOT weather-zone code (from
    :func:`assign_weather_zones`); ``members`` is the ERCOT county set (from
    :func:`ercot_member_counties`).  Only member counties are used; a member
    without a weather zone is returned in the third element (unassigned),
    never placed.  Returns ``(collection, county -> model zone, unassigned)``.
    """
    by_fips = {f["properties"]["fips"]: f for f in counties["features"] if f["properties"]["state"] == "TX"}
    missing = sorted(members - set(by_fips))
    if missing:
        raise ValueError(f"member counties absent from the counties file: {missing}")
    unassigned = sorted(fips for fips in members if fips not in weather_zone_of)
    model_zone = {fips: WEATHER_ZONE_TO_MODEL_ZONE[weather_zone_of[fips]] for fips in members if fips in weather_zone_of}
    centroids = {fips: geometry_centroid(by_fips[fips]["geometry"]) for fips in model_zone}
    model_zone = carve_panhandle(model_zone, centroids)

    features = []
    for zone in ERCOT_MODEL_ZONES:
        members = sorted(fips for fips, z in model_zone.items() if z == zone)
        if not members:
            raise ValueError(f"zone {zone} has no counties")
        weather_zones = sorted({weather_zone_of[fips] for fips in members}) if zone != PANHANDLE_ZONE else []
        geometry = dissolve([by_fips[fips]["geometry"] for fips in members])
        note = (
            "Model geographic rule (lon < -99.5, lat >= 33.5) on county centroids; "
            "no ERCOT weather zone maps to Panhandle"
            if zone == PANHANDLE_ZONE
            else "ERCOT weather zone(s) via the model's weather-zone crosswalk"
        )
        features.append(
            _feature(
                {
                    "zone": zone,
                    "counties": len(members),
                    "weather_zones": weather_zones,
                    "county_fips": members,
                    "note": note,
                },
                geometry,
            )
        )
    _log(f"ercot-zones: {len(features)} zones from {len(model_zone)} counties, {len(unassigned)} unassigned")
    return _collection(features), model_zone, unassigned


# --- output --------------------------------------------------------------------


def write_geojson(collection: dict, path: Path) -> int:
    """Write a FeatureCollection compactly and return its size in bytes."""
    for feature in collection["features"]:
        problems = validate_geometry(feature["geometry"])
        if problems:
            raise ValueError(f"{path.name}: invalid geometry {feature['properties']}: {problems}")
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(collection, separators=JSON_SEPARATORS, ensure_ascii=False)
    path.write_text(text, encoding="utf-8", newline="\n")
    return path.stat().st_size


def index_entry(
    asset_id: str, file_name: str, label: str, key_props: list[str], path: Path,
    collection: dict, source: str, license_text: str,
) -> dict:
    """One ``index.json`` row describing a written asset."""
    return {
        "id": asset_id,
        "file": file_name,
        "label": label,
        "kind": INDEX_KIND,
        "keyProps": key_props,
        "bytes": path.stat().st_size,
        "features": len(collection["features"]),
        "source": source,
        "license": license_text,
        "retrieved": RETRIEVED_DATE,
    }


def _check_size(path: Path, limit: int) -> None:
    size = path.stat().st_size
    if size > limit:
        raise ValueError(f"{path.name} is {size} bytes, over the {limit}-byte target")


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def build_all(cache_dir: Path, out_dir: Path, offline: bool = False) -> list[dict]:
    """Download (or reuse) every source, build the four files and the index."""
    states_raw = json.loads(fetch(SOURCES["states"], cache_dir, offline).read_text(encoding="utf-8"))
    world_raw = json.loads(fetch(SOURCES["world"], cache_dir, offline).read_text(encoding="utf-8"))
    counties_raw = json.loads(fetch(SOURCES["counties"], cache_dir, offline).read_text(encoding="utf-8"))
    zip_rows = read_xlsx_sheet(fetch(SOURCES["ercot_zip_to_zone"], cache_dir, offline), ZIP_TO_ZONE_SHEET)
    zcta_rows = read_zcta_county_rows(fetch(SOURCES["zcta_to_county"], cache_dir, offline))

    out_dir.mkdir(parents=True, exist_ok=True)
    entries: list[dict] = []

    states = build_states(states_raw)
    path = out_dir / "us-states.geojson"
    write_geojson(states, path)
    _check_size(path, STATES_MAX_BYTES)
    entries.append(index_entry("us-states", path.name, "US states", ["name", "code", "fips"], path, states,
                               SOURCES["states"].url, SOURCES["states"].license))

    world = build_world(world_raw)
    path = out_dir / "world-countries.geojson"
    write_geojson(world, path)
    _check_size(path, WORLD_MAX_BYTES)
    entries.append(index_entry("world-countries", path.name, "World countries", ["name", "iso_a2", "iso_a3"],
                               path, world, SOURCES["world"].url, SOURCES["world"].license))

    counties = build_counties(counties_raw)
    path = out_dir / "us-counties.geojson"
    write_geojson(counties, path)
    _check_size(path, COUNTIES_MAX_BYTES)
    entries.append(index_entry("us-counties", path.name, "US counties", ["name", "state", "fips"], path,
                               counties, SOURCES["counties"].url, SOURCES["counties"].license))

    weather_zone_of, weights = assign_weather_zones(parse_zip_to_zone(zip_rows), zcta_rows)
    members = ercot_member_counties(counties)
    zones, model_zone, unassigned = build_ercot_zones(counties, weather_zone_of, members)
    path = out_dir / "ercot-zones.geojson"
    write_geojson(zones, path)
    entries.append(index_entry(
        "ercot-zones", path.name, "ERCOT model zones", ["zone"], path, zones,
        "; ".join([SOURCES["counties"].url, ERCOT_COUNTY_MAP_URL, SOURCES["ercot_zip_to_zone"].url,
                   SOURCES["zcta_to_county"].url]),
        "Derived: " + "; ".join([SOURCES["counties"].license, "ERCOT County Map (ERCOT media kit, "
                                 "publicly posted; county membership read from it)",
                                 SOURCES["ercot_zip_to_zone"].license, SOURCES["zcta_to_county"].license]),
    ))
    county_name = {f["properties"]["fips"]: f["properties"]["name"] for f in counties["features"]}
    (out_dir / "ercot-zone-counties.json").write_text(
        json.dumps(
            {
                "retrieved": RETRIEVED_DATE,
                "unassigned": {fips: county_name[fips] for fips in unassigned},
                "counties": {
                    fips: {"name": county_name[fips], "zone": model_zone[fips],
                           "weather_zone": weather_zone_of[fips],
                           "weather_zone_shares": {k: round(v, 4) for k, v in weights[fips].items()}}
                    for fips in sorted(model_zone)
                },
            },
            indent=JSON_INDENT,
            sort_keys=True,
        ) + "\n",
        encoding="utf-8",
    )

    (out_dir / INDEX_FILE).write_text(json.dumps(entries, indent=JSON_INDENT) + "\n", encoding="utf-8")
    for entry in entries:
        _log(f"{entry['file']}: {entry['bytes']} bytes, {entry['features']} features")
    return entries


def main(argv: list[str] | None = None) -> int:
    """CLI entry point."""
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--cache", type=Path, default=DEFAULT_CACHE_DIR, help="download cache directory")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_DIR, help="output directory (public/geo)")
    parser.add_argument("--offline", action="store_true", help="never download; fail when a source is missing")
    args = parser.parse_args(argv)
    try:
        build_all(args.cache, args.out, args.offline)
    except (FileNotFoundError, ValueError, KeyError) as exc:
        _log(f"build_geo_assets: {exc}")
        return EXIT_USAGE
    return 0


if __name__ == "__main__":
    sys.exit(main())
