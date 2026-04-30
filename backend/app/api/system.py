"""System info — exposes the detected SystemProfile and live RAM."""
from __future__ import annotations

from fastapi import APIRouter

from app.core import system_detector
from app.services.llm_service import service

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("")
async def get_system() -> dict:
    avail, total = system_detector.live_ram_mb()
    profile = service.router.system.to_dict()
    profile["ram_available_mb"] = avail
    profile["ram_total_mb"] = total
    return profile


@router.post("/redetect")
async def redetect() -> dict:
    profile = system_detector.detect_system()
    service.router.update_system(profile)
    return profile.to_dict()
