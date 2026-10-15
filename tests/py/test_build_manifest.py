"""Tests for scripts/build_manifest.py (stdlib + pytest only)."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

import build_manifest as bm

SCRIPT = Path(bm.__file__)


def _write(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="")
    return path


@pytest.fixture
def datasets(tmp_path: Path) -> Path:
    folder = tmp_path / "data" / "datasets"
    folder.mkdir(parents=True)
    return folder


# --- row counting -------------------------------------------------------------


def test_count_rows_plain(datasets: Path) -> None:
    f = _write(datasets / "a.csv", "x,y\n1,2\n3,4\n")
    assert bm.count_rows(f) == 2


def test_count_rows_without_trailing_newline(datasets: Path) -> None:
    f = _write(datasets / "a.csv", "x,y\n1,2\n3,4")
    assert bm.count_rows(f) == 2


def test_count_rows_ignores_quoted_newlines_and_escaped_quotes(datasets: Path) -> None:
    body = 'x,y\n1,"multi\nline"\n2,"say ""hi""\nthere"\n3,"""quoted"""\n'
    f = _write(datasets / "a.csv", body)
    assert bm.count_rows(f) == 3


def test_count_rows_quoted_field_spanning_chunks(datasets: Path, monkeypatch) -> None:
    monkeypatch.setattr(bm, "CHUNK_BYTES", 7)
    body = 'x,y\n1,"a\nb\nc"\n2,"d""\ne"\n3,z\n'
    f = _write(datasets / "a.csv", body)
    assert bm.count_rows(f) == 3


def test_count_rows_header_only_and_empty(datasets: Path) -> None:
    assert bm.count_rows(_write(datasets / "h.csv", "x,y\n")) == 0
    assert bm.count_rows(_write(datasets / "e.csv", "")) == 0


def test_large_file_rows_null(datasets: Path, monkeypatch) -> None:
    monkeypatch.setattr(bm, "LARGE_FILE_BYTES", 10)
    _write(datasets / "big.csv", "x,y\n" + "1,2\n" * 10)
    entry = bm.build(datasets)["datasets"][0]
    assert entry["rows"] is None
    assert entry["columns"] == ["x", "y"]


# --- header / names -----------------------------------------------------------


def test_header_parsed_with_csv_module(datasets: Path) -> None:
    f = _write(datasets / "a.csv", '"first, name",b,"c ""q"""\n1,2,3\n')
    assert bm.read_header(f) == ["first, name", "b", 'c "q"']


def test_header_strips_bom(datasets: Path) -> None:
    f = datasets / "a.csv"
    f.write_bytes(b"\xef\xbb\xbfid,v\n1,2\n")
    assert bm.read_header(f) == ["id", "v"]


@pytest.mark.parametrize(
    ("stem", "slug", "name"),
    [
        ("Sales Data", "sales-data", "Sales Data"),
        ("gdp_2020-2024", "gdp-2020-2024", "Gdp 2020-2024"),
        ("  weird__File!!.v2 ", "weird-file-v2", "Weird File V2"),
        ("q1-results", "q1-results", "Q1 Results"),
        ("2023", "2023", "2023"),
    ],
)
def test_slug_and_name(stem: str, slug: str, name: str) -> None:
    assert bm.slugify(stem) == slug
    assert bm.display_name(slug) == name


def test_entry_fields(datasets: Path) -> None:
    _write(datasets / "My Set.csv", "a,b\n1,2\n")
    entry = bm.build(datasets)["datasets"][0]
    assert entry["id"] == "my-set"
    assert entry["file"] == "data/datasets/My Set.csv"
    assert entry["name"] == "My Set"
    assert entry["bytes"] == len("a,b\n1,2\n")
    assert entry["rows"] == 1
    assert entry["columns"] == ["a", "b"]
    assert len(entry["sha1"]) == 40
    assert entry["modified"].endswith("Z")
    assert entry["description"] is None
    assert entry["source"] == "catalog"
    assert list(entry) == [
        "id", "file", "name", "bytes", "rows", "columns", "sha1",
        "modified", "description", "source",
    ]


# --- sidecar description ------------------------------------------------------


def test_sidecar_description_skips_headings_and_blank_lines(datasets: Path) -> None:
    _write(datasets / "cities.csv", "a\n1\n")
    _write(datasets / "cities.md", "# Cities\n\n## sub\n  World cities by population.  \nmore\n")
    entry = bm.build(datasets)["datasets"][0]
    assert entry["description"] == "World cities by population."


def test_sidecar_lookup_by_original_stem(datasets: Path) -> None:
    _write(datasets / "Big Cities.csv", "a\n1\n")
    _write(datasets / "Big Cities.md", "Only text.\n")
    assert bm.build(datasets)["datasets"][0]["description"] == "Only text."


def test_sidecar_with_only_headings_gives_null(datasets: Path) -> None:
    _write(datasets / "a.csv", "a\n1\n")
    _write(datasets / "a.md", "# Title\n## Sub\n")
    assert bm.build(datasets)["datasets"][0]["description"] is None


# --- listing / sorting / determinism -----------------------------------------


def test_sorted_by_name_and_non_csv_ignored(datasets: Path) -> None:
    _write(datasets / "zeta.csv", "a\n1\n")
    _write(datasets / "alpha.csv", "a\n1\n")
    _write(datasets / "Mid.CSV", "a\n1\n")
    _write(datasets / "notes.txt", "nope")
    _write(datasets / "readme.md", "nope")
    _write(datasets / ".hidden.csv", "a\n1\n")
    (datasets / "sub.csv").mkdir()
    names = [e["name"] for e in bm.build(datasets)["datasets"]]
    assert names == ["Alpha", "Mid", "Zeta"]


def test_build_missing_dir_raises(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        bm.build(tmp_path / "nope")


def test_cli_missing_dir_exit_code(tmp_path: Path) -> None:
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--datasets", str(tmp_path / "nope"),
         "--out", str(tmp_path / "m.json")],
        capture_output=True, text=True,
    )
    assert proc.returncode == bm.EXIT_MISSING_DIR
    assert "not found" in proc.stderr


def test_cli_writes_out_and_also_only_where_parent_exists(datasets: Path, tmp_path: Path) -> None:
    _write(datasets / "a.csv", "a,b\n1,2\n")
    out = tmp_path / "data" / "manifest.json"
    also_ok = tmp_path / "dist" / "data" / "manifest.json"
    also_missing = tmp_path / "nowhere" / "manifest.json"
    also_ok.parent.mkdir(parents=True)
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--datasets", str(datasets), "--out", str(out),
         "--also", str(also_ok), "--also", str(also_missing)],
        capture_output=True, text=True,
    )
    assert proc.returncode == 0, proc.stderr
    assert out.is_file() and also_ok.is_file() and not also_missing.exists()
    assert out.read_text() == also_ok.read_text()
    doc = json.loads(out.read_text())
    assert doc["version"] == 1
    assert doc["datasets"][0]["id"] == "a"


def test_output_deterministic(datasets: Path) -> None:
    _write(datasets / "b.csv", "a,b\n1,2\n")
    _write(datasets / "a.csv", "a,b\n1,2\n3,4\n")
    first, second = bm.build(datasets), bm.build(datasets)
    assert first["datasets"] == second["datasets"]
    assert list(first) == ["version", "generatedAt", "datasets"]
    text = bm.dumps(first)
    assert text.endswith("\n") and not text.endswith("\n\n")
    assert text.startswith('{\n  "version": 1,\n  "generatedAt": "')
    assert json.loads(text) == first
