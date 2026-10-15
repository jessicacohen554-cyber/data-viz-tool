"""Local web launcher for the data-viz tool.

Serves the built site (``dist/``) on localhost, but answers every ``/data/...``
request from the LIVE ``data/`` folder (outside ``public/`` so Vite never copies
the CSVs into the committed ``dist/``), so you can drop a new CSV into
``data/datasets/`` and just refresh the browser; no rebuild needed. On start
(and on every ``GET /api/manifest``) it regenerates ``data/manifest.json``
through scripts/build_manifest.py so the catalog always matches what is on
disk.

stdlib only (http.server + threads), so the bootstrap needs nothing beyond
Python itself. Launched by run-viz.bat (Windows) / run-viz.sh; or directly::

    python tools/launcher.py [--port 8766] [--no-browser] [--root DIR]
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
import threading
import webbrowser
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

REPO = Path(__file__).resolve().parent.parent
# build_manifest.py is stdlib-only, so importing it keeps the launcher
# dependency-free; it is the single source of truth for the manifest schema.
sys.path.insert(0, str(REPO / "scripts"))
import build_manifest  # noqa: E402

HOST = "127.0.0.1"
PORT = 8766
BROWSER_DELAY_SECONDS = 0.6
# Level 1 keeps the 35 MB stress file snappy; the browser inflates it anyway.
GZIP_LEVEL = 1
DATA_URL_PREFIX = "/data/"
MANIFEST_API_PATH = "/api/manifest"
INDEX_FILE = "index.html"
FAVICON_PATH = "/favicon.ico"
BYTES_PER_MB = 1024 * 1024

_CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".wasm": "application/wasm",
    ".map": "application/json",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
}
_DEFAULT_CONTENT_TYPE = "application/octet-stream"
# Anything the user edits or that the launcher regenerates must never be cached.
_NO_STORE_SUFFIXES = {".json", ".csv", ".html"}
_GZIP_SUFFIXES = {".csv"}

MISSING_DIST_MESSAGE = """\
dist/index.html is missing, so there is no site to serve.
Either run run-viz.bat / run-viz.sh on a machine with Node.js installed
(it runs `npm run build`), or pull the committed dist/ folder from git.
"""


@dataclass(frozen=True)
class Layout:
    """Folders the launcher serves from, all derived from the repo root."""

    root: Path

    @property
    def dist(self) -> Path:
        return self.root / "dist"

    @property
    def data_dir(self) -> Path:
        return self.root / "data"

    @property
    def datasets_dir(self) -> Path:
        return self.data_dir / "datasets"

    @property
    def index(self) -> Path:
        return self.dist / INDEX_FILE

    @property
    def manifest(self) -> Path:
        return self.data_dir / "manifest.json"


def regenerate_manifest(layout: Layout) -> dict:
    """Rebuild the manifest from the live datasets folder and write it out.

    The datasets folder is created if missing so a fresh clone works and the
    user has somewhere to drop files.
    """
    layout.datasets_dir.mkdir(parents=True, exist_ok=True)
    manifest = build_manifest.build(layout.datasets_dir)
    build_manifest.write_manifest(manifest, [layout.manifest])
    return manifest


def format_table(manifest: dict) -> str:
    """Render the dataset catalog as an aligned name / rows / MB table."""
    rows = [
        (
            entry["name"],
            "?" if entry["rows"] is None else f"{entry['rows']:,}",
            f"{entry['bytes'] / BYTES_PER_MB:.2f}",
        )
        for entry in manifest["datasets"]
    ]
    if not rows:
        return "  (no CSV files yet; drop some into data/datasets/)"
    header = ("dataset", "rows", "MB")
    widths = [max(len(r[i]) for r in [header, *rows]) for i in range(len(header))]
    lines = [header, tuple("-" * w for w in widths), *rows]
    return "\n".join(
        f"  {name.ljust(widths[0])}  {n.rjust(widths[1])}  {mb.rjust(widths[2])}"
        for name, n, mb in lines
    )


class Handler(BaseHTTPRequestHandler):
    """Static file server with a live ``/data/`` overlay and a manifest API."""

    server_version = "DataVizLauncher/1"

    @property
    def layout(self) -> Layout:
        return self.server.layout  # type: ignore[attr-defined]

    # --- logging: one quiet line per request, no favicon noise ---------------
    def log_message(self, *args) -> None:
        pass

    def log_request(self, code="-", size="-") -> None:
        if urlparse(self.path).path == FAVICON_PATH:
            return
        print(f"{self.command} {self.path} -> {code}")

    # --- response helpers ------------------------------------------------------
    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, code: int = HTTPStatus.OK) -> None:
        self._send(
            code,
            json.dumps(obj).encode(),
            _CONTENT_TYPES[".json"],
            {"Cache-Control": "no-store"},
        )

    def _accepts_gzip(self) -> bool:
        encodings = self.headers.get("Accept-Encoding", "")
        return any(token.strip().split(";")[0] == "gzip" for token in encodings.split(","))

    # --- routing ---------------------------------------------------------------
    def do_HEAD(self) -> None:
        self.do_GET()

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == MANIFEST_API_PATH:
            try:
                self._json(regenerate_manifest(self.layout))
            except OSError as exc:
                self._json({"error": str(exc)}, HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        self._serve_static(path)

    def _resolve(self, base: Path, relative: str) -> Path | None:
        """Map ``relative`` under ``base``; None if it escapes ``base`` (traversal)."""
        target = (base / relative).resolve()
        base = base.resolve()
        try:
            if os.path.commonpath([base, target]) != str(base):
                return None
        except ValueError:  # different drives on Windows
            return None
        return target

    def _serve_static(self, path: str) -> None:
        layout = self.layout
        if path in ("/", f"/{INDEX_FILE}"):
            candidates = [(layout.dist, INDEX_FILE)]
        elif path.startswith(DATA_URL_PREFIX):
            # Live data/ folder only; dist/ never holds datasets.
            candidates = [(layout.data_dir, path[len(DATA_URL_PREFIX):])]
        else:
            candidates = [(layout.dist, path.lstrip("/"))]

        forbidden = False
        for base, relative in candidates:
            target = self._resolve(base, relative)
            if target is None:
                forbidden = True
                continue
            if target.is_file():
                self._send_file(target)
                return
        if forbidden:
            self._json({"error": "forbidden"}, HTTPStatus.FORBIDDEN)
        else:
            self._json({"error": "not found"}, HTTPStatus.NOT_FOUND)

    def _send_file(self, target: Path) -> None:
        suffix = target.suffix.lower()
        ctype = _CONTENT_TYPES.get(suffix, _DEFAULT_CONTENT_TYPE)
        extra: dict[str, str] = {}
        if suffix in _NO_STORE_SUFFIXES:
            extra["Cache-Control"] = "no-store"
        body = target.read_bytes()
        if suffix in _GZIP_SUFFIXES:
            extra["Vary"] = "Accept-Encoding"
            if self._accepts_gzip():
                body = gzip.compress(body, compresslevel=GZIP_LEVEL)
                extra["Content-Encoding"] = "gzip"
        self._send(HTTPStatus.OK, body, ctype, extra)


def create_server(root: Path, port: int = PORT) -> ThreadingHTTPServer:
    """Bind a server for ``root`` on ``HOST:port`` (``port=0`` picks a free one)."""
    server = ThreadingHTTPServer((HOST, port), Handler)
    server.layout = Layout(Path(root).resolve())  # type: ignore[attr-defined]
    return server


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--port", type=int, default=PORT, help=f"listen port (default {PORT})")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser tab")
    parser.add_argument(
        "--root", type=Path, default=REPO, help="repo root to serve (default: this checkout)"
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    """Regenerate the manifest, print the catalog, serve until Ctrl+C."""
    args = _parse_args(argv)
    layout = Layout(args.root.resolve())
    if not layout.index.is_file():
        sys.exit(MISSING_DIST_MESSAGE)

    manifest = regenerate_manifest(layout)
    print(f"Datasets in {layout.datasets_dir}:")
    print(format_table(manifest))
    print()

    server = create_server(layout.root, args.port)
    url = f"http://{HOST}:{server.server_address[1]}/"
    print(f"Data Viz launcher running at {url}")
    print("Drop CSV files into data/datasets/ and refresh the page.")
    print("Leave this window open; press Ctrl+C (or close it) to stop the server.")
    if not args.no_browser:
        threading.Timer(BROWSER_DELAY_SECONDS, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopping…")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
