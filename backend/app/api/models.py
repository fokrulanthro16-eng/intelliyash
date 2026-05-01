"""Models endpoints — list, status, manual download/load (advanced UI)."""
from __future__ import annotations

import asyncio
import importlib.util

from fastapi import APIRouter, BackgroundTasks, HTTPException
from loguru import logger

from app.core import model_registry
from app.core.model_manager import MemoryGuardError, manager
from app.services.llm_service import service

router = APIRouter(prefix="/api/models", tags=["models"])

_LLAMA_AVAILABLE = importlib.util.find_spec("llama_cpp") is not None
_NO_LOCAL_MSG = (
    "Local model loading is unavailable on this deployment. "
    "Use a cloud API key or low-memory mode instead."
)


def _spec_dict(spec) -> dict:
    return {
        "id": spec.id,
        "display_name": spec.display_name,
        "tier": spec.tier,
        "tasks": list(spec.tasks),
        "size_mb": spec.size_mb,
        "runtime_ram_mb": spec.runtime_ram_mb,
        "description": spec.description,
        "downloaded": manager.is_downloaded(spec),
    }


@router.get("")
async def list_models() -> dict:
    return {
        "models": [_spec_dict(m) for m in model_registry.all_models()],
        "loaded": manager.loaded.id if manager.loaded else None,
        "recommended_tier": service.router.system.tier,
    }


@router.post("/{model_id}/download")
async def download_model(model_id: str, background: BackgroundTasks) -> dict:
    if not _LLAMA_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"error": "not_available", "message": _NO_LOCAL_MSG},
        )
    spec = model_registry.get_by_id(model_id)
    if spec is None:
        raise HTTPException(404, "unknown model")

    def _do() -> None:
        try:
            manager.download(spec)
        except Exception as exc:
            logger.exception(f"download {model_id} failed: {exc}")

    background.add_task(_do)
    return {"status": "scheduled", "model_id": model_id}


@router.post("/{model_id}/load")
async def load_model(model_id: str) -> dict:
    if not _LLAMA_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail={"error": "not_available", "message": _NO_LOCAL_MSG},
        )
    spec = model_registry.get_by_id(model_id)
    if spec is None:
        raise HTTPException(404, "unknown model")
    profile = service.router.system
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(
            None, manager.load, spec, profile.recommended_threads, profile.recommended_ctx
        )
    except MemoryGuardError as exc:
        raise HTTPException(
            status_code=409,
            detail={"error": "memory_guard", "message": str(exc)},
        )
    except Exception as exc:
        logger.exception(f"load_model {model_id} failed")
        raise HTTPException(
            status_code=503,
            detail={"error": "load_failed", "message": str(exc)},
        )
    return {"status": "loaded", "model_id": model_id}


@router.post("/unload")
async def unload_model() -> dict:
    manager.unload()
    return {"status": "unloaded"}
