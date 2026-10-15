"""Generate ``data/manifest.json`` from the CSV datasets folder.

GitHub Pages has no directory listing, so the viewer cannot discover which
CSV files live under ``data/datasets/`` (kept outside ``public/`` so Vite does
not copy the CSVs into the committed ``dist/``; the launcher and CI serve or
publish them separately). This script enumerates them
and writes a small catalog (schema version 1) the UI loads at startup:

    {
      "version": 1,
      "generatedAt": "<ISO UTC>",
      "datasets": [
        {"id": "...", "file": "data/datasets/<name>.csv", "name": "...",
         "bytes": 123, "rows": 456, "columns": ["a", "b"], "sha1": "...",
         "modified": "<ISO UTC mtime>", "description": "...|null",
         "source": "catalog"}
      ]
    }

Row counts stream through the file in binary chunks so a multi-hundred-MB
file never has to fit in memory; newlines inside double-quoted fields are not
counted as row breaks. Files larger than ``LARGE_FILE_BYTES`` get
``rows: null`` so a stray giant file cannot stall the launcher.

stdlib only. Run by CI before ``npm run build``, by tools/launcher.py on every
start (and on ``GET /api/manifest``), or directly::

    python scripts/build_manifest.py [--datasets DIR] [--out FILE] [--also FILE]
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

MANIFEST_VERSION = 1
DEFAULT_DATASETS_DIR = REPO / "data" / "datasets"
DEFAULT_OUT = REPO / "data" / "manifest.json"
# URL prefix the browser uses for a dataset, relative to the site root.
DATA_URL_PREFIX = "data/datasets"
CSV_SUFFIX = ".csv"
SIDECAR_SUFFIX = ".md"
SOURCE_LABEL = "catalog"
# Above this size we skip the row count entirely (rows -> null).
LARGE_FILE_BYTES = 200 * 1024 * 1024
# Chunk size for the streaming row counter and the SHA-1 digest.
CHUNK_BYTES = 1 << 20
JSON_INDENT = 2
EXIT_MISSING_DIR = 2

_QUOTE = b'"'
_NEWLINE = b"\n"
_HEADING_PREFIX = "#"


def iso_utc(moment: datetime) -> str:
    """Format ``moment`` as an ISO-8601 UTC timestamp with a ``Z`` suffix."""
    return (
        moment.astimezone(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def slugify(stem: str) -> str:
    """Lower-case ``stem`` and collapse every non-alphanumeric run to ``-``."""
    return re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")


def display_name(slug: str) -> str:
    """Title-case a slug, keeping digit runs and ranges (``2020-2024``) intact.

    Hyphens flanked by digits on both sides are treated as part of a range and
    kept; every other hyphen becomes a space.
    """
    words = re.split(r"(?<!\d)-|-(?!\d)", slug)
    return " ".join(w[:1].upper() + w[1:] for w in words if w)


def count_rows(path: Path) -> int:
    """Count CSV data rows (header excluded), streaming the file in chunks.

    A tiny state machine tracks whether we are inside a double-quoted field;
    a ``\\n`` only ends a record when outside quotes. Doubled quotes (``""``)
    inside a field toggle the state twice, so they fall out naturally. The
    final record is counted even without a trailing newline.
    """
    records = 0
    in_quotes = False
    last_byte = b""
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK_BYTES):
            # Splitting on quotes gives alternating outside/inside segments;
            # only the outside ones contribute newlines.
            for index, segment in enumerate(chunk.split(_QUOTE)):
                if index:
                    in_quotes = not in_quotes
                if not in_quotes:
                    records += segment.count(_NEWLINE)
            last_byte = chunk[-1:]
    if last_byte and last_byte != _NEWLINE:
        records += 1  # unterminated last line
    return max(records - 1, 0)


def read_header(path: Path) -> list[str]:
    """Parse the first CSV line into column names (empty list for an empty file)."""
    with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as fh:
        return next(csv.reader(fh), [])


def sha1_of(path: Path) -> str:
    """Hex SHA-1 of the file's bytes, read in chunks."""
    digest = hashlib.sha1()
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK_BYTES):
            digest.update(chunk)
    return digest.hexdigest()


def read_description(csv_path: Path, dataset_id: str) -> str | None:
    """First non-heading, non-blank line of ``<id>.md`` next to the CSV, or None.

    ``<original stem>.md`` is accepted as a fallback for files whose name is
    not already a slug.
    """
    for stem in (dataset_id, csv_path.stem):
        sidecar = csv_path.with_name(stem + SIDECAR_SUFFIX)
        if not sidecar.is_file():
            continue
        for line in sidecar.read_text(encoding="utf-8", errors="replace").splitlines():
            text = line.strip()
            if text and not text.startswith(_HEADING_PREFIX):
                return text
        return None
    return None


def describe(path: Path) -> dict:
    """Build the manifest entry for one CSV file."""
    stat = path.stat()
    dataset_id = slugify(path.stem)
    return {
        "id": dataset_id,
        "file": f"{DATA_URL_PREFIX}/{path.name}",
        "name": display_name(dataset_id),
        "bytes": stat.st_size,
        "rows": None if stat.st_size > LARGE_FILE_BYTES else count_rows(path),
        "columns": read_header(path),
        "sha1": sha1_of(path),
        "modified": iso_utc(datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)),
        "description": read_description(path, dataset_id),
        "source": SOURCE_LABEL,
    }


def list_csv_files(datasets_dir: Path) -> list[Path]:
    """CSV files directly under ``datasets_dir``; dotfiles and other suffixes skipped."""
    return [
        p
        for p in sorted(datasets_dir.iterdir())
        if p.is_file()
        and p.suffix.lower() == CSV_SUFFIX
        and not p.name.startswith(".")
    ]


def build(datasets_dir: Path) -> dict:
    """Return the manifest dict for every CSV in ``datasets_dir`` (sorted by name).

    Raises ``FileNotFoundError`` when the directory does not exist.
    """
    datasets_dir = Path(datasets_dir)
    if not datasets_dir.is_dir():
        raise FileNotFoundError(f"datasets directory not found: {datasets_dir}")
    entries = [describe(p) for p in list_csv_files(datasets_dir)]
    entries.sort(key=lambda e: (e["name"], e["id"]))
    return {
        "version": MANIFEST_VERSION,
        "generatedAt": iso_utc(datetime.now(tz=timezone.utc)),
        "datasets": entries,
    }


def dumps(manifest: dict) -> str:
    """Serialise deterministically: insertion key order, 2-space indent, newline."""
    return json.dumps(manifest, indent=JSON_INDENT, ensure_ascii=False) + "\n"


def write_manifest(manifest: dict, targets: list[Path]) -> list[Path]:
    """Write ``manifest`` to each target whose parent folder exists; return those written."""
    text = dumps(manifest)
    written = []
    for target in targets:
        target = Path(target)
        if not target.parent.is_dir():
            continue
        target.write_text(text, encoding="utf-8")
        written.append(target)
    return written


def _parse_args(argv: list[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument(
        "--datasets",
        type=Path,
        default=DEFAULT_DATASETS_DIR,
        help="folder containing the CSV datasets (default: data/datasets)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=DEFAULT_OUT,
        help="manifest path to write (default: data/manifest.json)",
    )
    parser.add_argument(
        "--also",
        type=Path,
        action="append",
        default=[],
        metavar="FILE",
        help="extra path to write, skipped if its folder is missing (repeatable)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    """CLI entry point; returns the process exit code."""
    args = _parse_args(argv)
    try:
        manifest = build(args.datasets)
    except FileNotFoundError as exc:
        print(f"build_manifest: {exc}", file=sys.stderr)
        return EXIT_MISSING_DIR
    for target in write_manifest(manifest, [args.out, *args.also]):
        print(f"wrote {target} ({len(manifest['datasets'])} datasets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
