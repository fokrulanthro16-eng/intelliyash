"""Settings endpoints — let the frontend toggle simple options."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from loguru import logger
from pydantic import BaseModel

from app.config import settings as runtime_settings
from app.db import database as db

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsPayload(BaseModel):
    enable_cloud_fallback: Optional[bool] = None
    cloud_provider: Optional[str] = None      # "anthropic" | "openai" | "gemini" | "huggingface"
    cloud_api_key: Optional[str] = None       # Anthropic key (never persisted)
    openai_api_key: Optional[str] = None      # OpenAI key    (never persisted)
    gemini_api_key: Optional[str] = None      # Gemini key    (never persisted)
    hf_token: Optional[str] = None            # HuggingFace token (never persisted)
    cloud_model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    idle_unload_seconds: Optional[int] = None


_SETTINGS_DEFAULTS = {
    "enable_cloud_fallback": False,
    "cloud_provider":        "",
    "cloud_model":           "",
    "has_cloud_api_key":     False,
    "temperature":           0.7,
    "max_tokens":            512,
    "idle_unload_seconds":   300,
}


@router.get("")
async def get_settings() -> dict:
    try:
        return {
            "enable_cloud_fallback": runtime_settings.enable_cloud_fallback,
            "cloud_provider":        runtime_settings.cloud_provider,
            "cloud_model":           runtime_settings.cloud_model,
            "has_cloud_api_key":     bool(
                runtime_settings.cloud_api_key
                or runtime_settings.openai_api_key
                or runtime_settings.gemini_api_key
                or runtime_settings.hf_token
            ),
            "temperature":           runtime_settings.temperature,
            "max_tokens":            runtime_settings.max_tokens,
            "idle_unload_seconds":   runtime_settings.idle_unload_seconds,
        }
    except Exception:
        logger.exception("get_settings failed — returning defaults")
        return _SETTINGS_DEFAULTS


@router.post("")
async def update_settings(payload: SettingsPayload) -> dict:
    if payload.enable_cloud_fallback is not None:
        runtime_settings.enable_cloud_fallback = payload.enable_cloud_fallback
        await db.set_setting("enable_cloud_fallback", "1" if payload.enable_cloud_fallback else "0")
    if payload.cloud_provider is not None:
        runtime_settings.cloud_provider = payload.cloud_provider
        await db.set_setting("cloud_provider", payload.cloud_provider)
    if payload.cloud_model is not None:
        runtime_settings.cloud_model = payload.cloud_model
        await db.set_setting("cloud_model", payload.cloud_model)
    # Keys are held in memory only — never written to disk.
    if payload.cloud_api_key is not None:
        runtime_settings.cloud_api_key = payload.cloud_api_key or None
    if payload.openai_api_key is not None:
        runtime_settings.openai_api_key = payload.openai_api_key or None
    if payload.gemini_api_key is not None:
        runtime_settings.gemini_api_key = payload.gemini_api_key or None
    if payload.hf_token is not None:
        runtime_settings.hf_token = payload.hf_token or None
    if payload.temperature is not None:
        runtime_settings.temperature = max(0.0, min(2.0, payload.temperature))
        await db.set_setting("temperature", str(runtime_settings.temperature))
    if payload.max_tokens is not None:
        runtime_settings.max_tokens = max(16, min(4096, payload.max_tokens))
        await db.set_setting("max_tokens", str(runtime_settings.max_tokens))
    if payload.idle_unload_seconds is not None:
        runtime_settings.idle_unload_seconds = max(30, payload.idle_unload_seconds)
        await db.set_setting("idle_unload_seconds", str(runtime_settings.idle_unload_seconds))
    return await get_settings()


async def load_persisted() -> None:
    """Called on startup to apply previously saved settings."""
    for key, attr, cast in [
        ("enable_cloud_fallback", "enable_cloud_fallback", lambda v: v == "1"),
        ("cloud_provider", "cloud_provider", str),
        ("cloud_model", "cloud_model", str),
        ("temperature", "temperature", float),
        ("max_tokens", "max_tokens", int),
        ("idle_unload_seconds", "idle_unload_seconds", int),
    ]:
        val = await db.get_setting(key)
        if val is not None:
            try:
                setattr(runtime_settings, attr, cast(val))
            except Exception:
                pass
