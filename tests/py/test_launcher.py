"""Tests for tools/launcher.py: start the server on port 0 against a tmp root."""

from __future__ import annotations

import gzip
import http.client
import json
import threading
from pathlib import Path

import pytest

import launcher

CSV_BODY = b"id,name\n1,\"multi\nline\"\n2,two\n"
INDEX_BODY = b"<!doctype html><title>viz</title>"


@pytest.fixture
def root(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_bytes(INDEX_BODY)
    (dist / "assets").mkdir()
    (dist / "assets" / "app.js").write_bytes(b"console.log(1)")
    (dist / "assets" / "app.css").write_bytes(b"body{}")
    (dist / "assets" / "meta.json").write_bytes(b"{}")
    (dist / "data").mkdir()
    (dist / "data" / "built.csv").write_bytes(b"a\n1\n")
    datasets = tmp_path / "data" / "datasets"
    datasets.mkdir(parents=True)
    (datasets / "x.csv").write_bytes(CSV_BODY)
    (tmp_path / "etc").mkdir()
    (tmp_path / "etc" / "passwd").write_text("nope")
    return tmp_path


@pytest.fixture
def server(root: Path):
    srv = launcher.create_server(root, port=0)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    try:
        yield srv
    finally:
        srv.shutdown()
        srv.server_close()
        thread.join(timeout=5)


def _get(server, path: str, headers: dict | None = None):
    conn = http.client.HTTPConnection(*server.server_address, timeout=5)
    try:
        conn.request("GET", path, headers=headers or {})
        resp = conn.getresponse()
        return resp.status, dict(resp.getheaders()), resp.read()
    finally:
        conn.close()


def test_root_serves_dist_index(server) -> None:
    status, headers, body = _get(server, "/")
    assert status == 200
    assert body == INDEX_BODY
    assert headers["Content-Type"].startswith("text/html")
    assert headers["Cache-Control"] == "no-store"


def test_data_csv_served_from_live_folder_raw(server) -> None:
    status, headers, body = _get(server, "/data/datasets/x.csv")
    assert status == 200
    assert body == CSV_BODY
    assert headers["Content-Type"] == "text/csv; charset=utf-8"
    assert headers["Cache-Control"] == "no-store"
    assert "Content-Encoding" not in headers


def test_data_csv_gzipped_when_accepted(server) -> None:
    status, headers, body = _get(server, "/data/datasets/x.csv", {"Accept-Encoding": "gzip, deflate"})
    assert status == 200
    assert headers["Content-Encoding"] == "gzip"
    assert headers["Vary"] == "Accept-Encoding"
    assert gzip.decompress(body) == CSV_BODY


def test_data_served_from_live_folder_only(server, root: Path) -> None:
    # dist/data is never consulted: only <root>/data/ answers /data/... requests.
    status, _, _ = _get(server, "/data/built.csv")
    assert status == 404
    (root / "data" / "built.csv").write_bytes(b"live\n")
    status, _, body = _get(server, "/data/built.csv")
    assert status == 200 and body == b"live\n"


def test_non_csv_not_gzipped(server) -> None:
    _, headers, _ = _get(server, "/assets/app.js", {"Accept-Encoding": "gzip"})
    assert "Content-Encoding" not in headers


def test_traversal_rejected(server) -> None:
    for path in ("/../../etc/passwd", "/data/../../etc/passwd", "/data/datasets/../../../etc/passwd"):
        status, _, body = _get(server, path)
        assert status in (403, 404), path
        assert b"nope" not in body


def test_api_manifest_returns_live_catalog(server, root: Path) -> None:
    status, headers, body = _get(server, "/api/manifest")
    assert status == 200
    assert headers["Content-Type"].startswith("application/json")
    assert headers["Cache-Control"] == "no-store"
    doc = json.loads(body)
    assert doc["version"] == 1
    assert [d["id"] for d in doc["datasets"]] == ["x"]
    assert doc["datasets"][0]["rows"] == 2
    assert doc["datasets"][0]["columns"] == ["id", "name"]
    # Regenerated on each call and written to <root>/data/manifest.json only.
    assert (root / "data" / "manifest.json").is_file()
    assert not (root / "dist" / "data" / "manifest.json").exists()
    (root / "data" / "datasets" / "y.csv").write_bytes(b"a\n1\n")
    doc = json.loads(_get(server, "/api/manifest")[2])
    assert [d["id"] for d in doc["datasets"]] == ["x", "y"]


def test_unknown_path_404(server) -> None:
    status, _, _ = _get(server, "/does/not/exist.html")
    assert status == 404
    status, _, _ = _get(server, "/data/datasets/missing.csv")
    assert status == 404


@pytest.mark.parametrize(
    ("path", "ctype"),
    [
        ("/assets/app.js", "text/javascript; charset=utf-8"),
        ("/assets/app.css", "text/css; charset=utf-8"),
        ("/assets/meta.json", "application/json; charset=utf-8"),
    ],
)
def test_mime_types(server, path: str, ctype: str) -> None:
    status, headers, _ = _get(server, path)
    assert status == 200
    assert headers["Content-Type"] == ctype


def test_main_exits_when_dist_missing(tmp_path: Path, capsys) -> None:
    with pytest.raises(SystemExit) as exc:
        launcher.main(["--root", str(tmp_path), "--no-browser", "--port", "0"])
    assert "dist/index.html" in str(exc.value)


def test_format_table_lists_name_rows_mb() -> None:
    manifest = {"datasets": [
        {"name": "Alpha", "rows": 1234, "bytes": 2 * 1024 * 1024},
        {"name": "Big", "rows": None, "bytes": 1},
    ]}
    text = launcher.format_table(manifest)
    assert "Alpha" in text and "1,234" in text and "2.00" in text
    assert "Big" in text and "?" in text
    assert "drop some" in launcher.format_table({"datasets": []})
