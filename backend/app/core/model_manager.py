"""ModelManager — owns model lifecycle: download, load, unload, generate.

Holds at most one Llama instance in memory at a time. Tracks last-used
timestamps so the Optimizer can evict idle models.
"""
from __future__ import annotations

import asyncio
import threading
import time
from pathlib import Path
from typing import AsyncIterator, Optional

from huggingface_hub import hf_hub_download
from loguru import logger

from app.config import settings
from app.core.model_registry import ModelSpec, get_by_id
from app.core.system_detector import live_ram_mb


class ModelLoadError(Exception):
    pass


class MemoryGuardError(ModelLoadError):
    """Raised when available RAM is insufficient to load a model safely."""
    pass


class ModelManager:
    """Singleton-style model lifecycle manager."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._llm = None                       # type: Optional[object]
        self._loaded_spec: Optional[ModelSpec] = None
        self._last_used: float = 0.0
        self._loading: bool = False

    # ----- download --------------------------------------------------------
    def is_downloaded(self, spec: ModelSpec) -> bool:
        path = settings.models_dir / spec.filename
        return path.exists() and path.stat().st_size > 1024 * 1024

    def model_path(self, spec: ModelSpec) -> Path:
        return settings.models_dir / spec.filename

    def download(self, spec: ModelSpec, progress_cb=None) -> Path:
        """Synchronous download. Caller should run in a thread for async ctx."""
        if self.is_downloaded(spec):
            return self.model_path(spec)
        logger.info(f"Downloading {spec.id} from {spec.repo_id}")
        local_path = hf_hub_download(
            repo_id=spec.repo_id,
            filename=spec.filename,
            local_dir=str(settings.models_dir),
            local_dir_use_symlinks=False,
        )
        logger.info(f"Downloaded {spec.id} → {local_path}")
        return Path(local_path)

    # ----- load / unload ---------------------------------------------------
    @property
    def loaded(self) -> Optional[ModelSpec]:
        return self._loaded_spec

    @property
    def is_loading(self) -> bool:
        return self._loading

    def load(self, spec: ModelSpec, n_threads: int, n_ctx: int) -> None:
        """Load a model into memory. Unloads any previously loaded model."""
        with self._lock:
            if self._loaded_spec and self._loaded_spec.id == spec.id:
                return

            # Memory Guard: check RAM before touching anything.
            available_mb, _ = live_ram_mb()
            needed_mb = spec.runtime_ram_mb + settings.ram_safety_margin_mb
            if available_mb < needed_mb:
                raise MemoryGuardError(
                    f"Cannot load '{spec.display_name}': requires ~{spec.runtime_ram_mb} MB "
                    f"+ {settings.ram_safety_margin_mb} MB safety margin = {needed_mb} MB total, "
                    f"but only {available_mb} MB is currently available. "
                    f"Try a smaller model."
                )

            self._loading = True
            try:
                self.unload()
                if not self.is_downloaded(spec):
                    self.download(spec)

                # Imported lazily so the module imports without llama-cpp present.
                from llama_cpp import Llama

                logger.info(f"Loading model {spec.id} (ctx={n_ctx}, threads={n_threads})")
                self._llm = Llama(
                    model_path=str(self.model_path(spec)),
                    n_ctx=n_ctx,
                    n_threads=n_threads,
                    n_batch=256,
                    verbose=False,
                    chat_format=spec.chat_format,
                )
                self._loaded_spec = spec
                self._last_used = time.time()
                logger.info(f"Model {spec.id} ready")
            finally:
                self._loading = False

    def unload(self) -> None:
        with self._lock:
            if self._llm is not None:
                logger.info(f"Unloading model {self._loaded_spec.id if self._loaded_spec else '?'}")
                try:
                    # llama-cpp Llama has no explicit close; rely on GC.
                    del self._llm
                except Exception:
                    pass
                self._llm = None
                self._loaded_spec = None

    # ----- generation ------------------------------------------------------
    def touch(self) -> None:
        self._last_used = time.time()

    @property
    def idle_seconds(self) -> float:
        if self._loaded_spec is None:
            return 0.0
        return time.time() - self._last_used

    def chat_sync(
        self,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Blocking single-shot chat completion."""
        if self._llm is None or self._loaded_spec is None:
            raise ModelLoadError("No model loaded")
        self.touch()
        out = self._llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        self.touch()
        return out["choices"][0]["message"]["content"]

    async def chat_stream(
        self,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
    ) -> AsyncIterator[str]:
        """Async streaming wrapper around the blocking llama_cpp generator."""
        if self._llm is None or self._loaded_spec is None:
            raise ModelLoadError("No model loaded")

        loop = asyncio.get_event_loop()
        queue: asyncio.Queue[Optional[str]] = asyncio.Queue()

        def _produce() -> None:
            try:
                stream = self._llm.create_chat_completion(
                    messages=messages,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    stream=True,
                )
                for chunk in stream:
                    delta = chunk["choices"][0].get("delta", {}).get("content")
                    if delta:
                        loop.call_soon_threadsafe(queue.put_nowait, delta)
            except Exception as exc:
                logger.exception("stream failed")
                loop.call_soon_threadsafe(queue.put_nowait, f"\n[error: {exc}]")
            finally:
                loop.call_soon_threadsafe(queue.put_nowait, None)

        threading.Thread(target=_produce, daemon=True).start()

        while True:
            piece = await queue.get()
            if piece is None:
                break
            self.touch()
            yield piece


# Process-global instance.
manager = ModelManager()
