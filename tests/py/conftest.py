"""pytest bootstrap: make the repo root, scripts/ and tools/ importable."""

from __future__ import annotations

import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

for folder in (REPO, REPO / "scripts", REPO / "tools"):
    path = str(folder)
    if path not in sys.path:
        sys.path.insert(0, path)
