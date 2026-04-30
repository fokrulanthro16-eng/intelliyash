"""Run the IntelliYash backend.

Usage:
    python run.py
    # or
    uvicorn app.main:app --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import uvicorn

from app.config import settings


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=False,
        log_level="info",
    )
