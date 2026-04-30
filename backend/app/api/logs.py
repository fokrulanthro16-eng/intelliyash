"""Lightweight in-memory log buffer — last 150 events, secrets filtered."""
from __future__ import annotations

import re
from collections import deque

from fastapi import APIRouter
from loguru import logger

router = APIRouter(prefix="/api/logs", tags=["logs"])

_BUFFER: deque[str] = deque(maxlen=150)

# Lines containing these patterns are dropped before returning to the client.
_SECRET_RE = re.compile(
    r"sk[-_]|hf_[a-zA-Z]|AIza|api[_\-]?key\s*=|bearer\s+[a-z0-9]|password\s*=|secret\s*=",
    re.IGNORECASE,
)


def _sink(message: "loguru.Message") -> None:
    line = message.record["message"]
    if _SECRET_RE.search(line):
        return
    ts  = message.record["time"].strftime("%H:%M:%S")
    lvl = message.record["level"].name
    _BUFFER.append(f"{ts} [{lvl}] {line}")


logger.add(_sink, format="{message}", level="DEBUG")


@router.get("")
def get_logs(limit: int = 60) -> dict:
    """Return the most recent log lines with secrets filtered out."""
    limit = min(max(1, limit), 150)
    return {"logs": list(_BUFFER)[-limit:]}
