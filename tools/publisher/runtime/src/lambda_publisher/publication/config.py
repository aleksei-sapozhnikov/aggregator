"""Read publication inputs and compute canonical queue digests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def data_root() -> Path:
    import os

    return Path(os.environ.get("DATA_DIR", "data"))


def load(name: str, root: Path | None = None):
    path = (root or data_root()) / name
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )


def queue_digest(queue: dict) -> str:
    payload = json.dumps(
        queue, sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode()).hexdigest()
