"""Health endpoints — used by the optimizer, frontend, and `test_system.py`."""
from __future__ import annotations

from fastapi import APIRouter

from app.core import system_detector
from app.core.model_manager import manager

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
async def health() -> dict:
    avail, total = system_detector.live_ram_mb()
    return {
        "status": "ok",
        "ram_available_mb": avail,
        "ram_total_mb": total,
        "loaded_model": manager.loaded.id if manager.loaded else None,
        "is_loading": manager.is_loading,
    }


@router.get("/ping")
async def ping() -> dict:
    return {"ok": True}
