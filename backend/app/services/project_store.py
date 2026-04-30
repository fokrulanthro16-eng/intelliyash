"""Persistent project registry — backed by backend/data/projects.json.

Thread-safe read/write with atomic replace so a server restart always
preserves previously generated projects.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path

_DATA_DIR  = Path(__file__).resolve().parents[2] / "data"
_STORE     = _DATA_DIR / "projects.json"
_lock      = threading.Lock()          # protects all file I/O


# ── private helpers (no locking — callers hold the lock) ──────────────────

def _read() -> list[dict]:
    try:
        return json.loads(_STORE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _write(projects: list[dict]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _STORE.with_suffix(".tmp")
    tmp.write_text(json.dumps(projects, indent=2), encoding="utf-8")
    tmp.replace(_STORE)                # atomic on POSIX, best-effort on Windows


# ── public API ────────────────────────────────────────────────────────────

def load_projects() -> list[dict]:
    """Return the full list of persisted project records."""
    with _lock:
        return _read()


def save_projects(projects: list[dict]) -> None:
    """Overwrite the persisted list (thread-safe)."""
    with _lock:
        _write(projects)


def register_project(record: dict) -> None:
    """Upsert a project by name.  Most-recent entry goes to the front."""
    with _lock:
        projects = _read()
        projects = [p for p in projects if p.get("name") != record.get("name")]
        projects.insert(0, record)
        _write(projects)


def remove_project(name: str) -> bool:
    """Delete a project record.  Returns True when it existed."""
    with _lock:
        projects = _read()
        filtered = [p for p in projects if p.get("name") != name]
        if len(filtered) == len(projects):
            return False
        _write(filtered)
        return True
