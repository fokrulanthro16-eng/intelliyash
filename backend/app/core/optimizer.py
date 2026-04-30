"""Optimizer — background loop that keeps the system responsive.

Responsibilities:
  - unload the model after `idle_unload_seconds` of inactivity
  - emergency unload when free RAM drops below `ram_safety_margin_mb`
  - re-detect system state periodically (RAM availability changes)
"""
from __future__ import annotations

import asyncio

from loguru import logger

from app.config import settings
from app.core import system_detector
from app.core.model_manager import manager


class Optimizer:
    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    async def start(self) -> None:
        self._stop.clear()
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop())
            logger.info("Optimizer started")

    async def stop(self) -> None:
        self._stop.set()
        if self._task:
            try:
                await asyncio.wait_for(self._task, timeout=2.0)
            except asyncio.TimeoutError:
                self._task.cancel()
        logger.info("Optimizer stopped")

    async def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                self._tick()
            except Exception:
                logger.exception("Optimizer tick failed")
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=10.0)
            except asyncio.TimeoutError:
                pass

    def _tick(self) -> None:
        if manager.loaded is None:
            return

        # Idle unload
        idle = manager.idle_seconds
        if idle > settings.idle_unload_seconds:
            logger.info(f"Idle for {idle:.0f}s — unloading {manager.loaded.id}")
            manager.unload()
            return

        # Emergency unload on low RAM
        avail_mb, _ = system_detector.live_ram_mb()
        if avail_mb < settings.ram_safety_margin_mb:
            logger.warning(
                f"Low RAM ({avail_mb} MB available). Unloading {manager.loaded.id}."
            )
            manager.unload()


optimizer = Optimizer()
