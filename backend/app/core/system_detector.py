"""SystemDetector — probes the host and decides which model tier to run.

The whole "Grandma Theory" hangs off this module: the user never picks a model,
this code does. We keep the heuristic simple and conservative — better to run a
small model fast than fail to load a big one.
"""
from __future__ import annotations

import os
import platform
from dataclasses import dataclass, asdict
from typing import Literal

import psutil


Tier = Literal["tiny", "mini", "medium", "large"]


@dataclass
class SystemProfile:
    os: str
    arch: str
    cpu_cores_physical: int
    cpu_cores_logical: int
    ram_total_mb: int
    ram_available_mb: int
    disk_free_gb: float
    has_avx2: bool
    has_cuda: bool
    tier: Tier
    recommended_threads: int
    recommended_ctx: int

    def to_dict(self) -> dict:
        return asdict(self)


def _has_avx2() -> bool:
    """Best-effort AVX2 detection. Falls back to False on non-Linux."""
    try:
        if platform.system() == "Linux":
            with open("/proc/cpuinfo", "r", encoding="utf-8") as f:
                return "avx2" in f.read().lower()
        if platform.system() == "Darwin":
            # Apple Silicon doesn't have AVX2; Intel macs mostly do post-2013.
            return platform.machine().lower() in {"x86_64", "amd64"}
        if platform.system() == "Windows":
            # No clean stdlib check; assume yes on x86_64.
            return platform.machine().lower() in {"amd64", "x86_64"}
    except Exception:
        return False
    return False


def _has_cuda() -> bool:
    """Detect a usable NVIDIA GPU. We only trust nvidia-smi being on PATH."""
    from shutil import which
    return which("nvidia-smi") is not None


def _pick_tier(ram_available_mb: int, disk_free_gb: float) -> Tier:
    """Choose a tier from currently-available RAM, leaving headroom for the OS.

    Thresholds are deliberately conservative — quantized GGUFs at runtime use
    more than the file size suggests once KV cache and OS overhead are added.
    """
    if disk_free_gb < 1.0:
        # Not enough room to even cache a tiny model.
        return "tiny"
    if ram_available_mb < 1500:
        return "tiny"        # ~0.5B Q4
    if ram_available_mb < 2800:
        return "mini"        # ~1.5B Q4
    if ram_available_mb < 5500:
        return "medium"      # ~3B Q4
    return "tiny"            # default: keep resource usage minimal


def _pick_threads(logical_cores: int) -> int:
    """Leave at least one core for the OS / frontend."""
    if logical_cores <= 2:
        return 2
    return max(2, logical_cores - 1)


def _pick_ctx(ram_available_mb: int) -> int:
    """KV cache scales with context. Don't promise more than we can keep."""
    if ram_available_mb < 1500:
        return 1024
    if ram_available_mb < 3000:
        return 2048
    return 4096


def detect_system() -> SystemProfile:
    """Build a SystemProfile snapshot of the current host."""
    vmem = psutil.virtual_memory()
    ram_total_mb = int(vmem.total / (1024 * 1024))
    ram_available_mb = int(vmem.available / (1024 * 1024))

    try:
        disk = psutil.disk_usage(os.path.expanduser("~"))
        disk_free_gb = round(disk.free / (1024 ** 3), 2)
    except Exception:
        disk_free_gb = 0.0

    logical = psutil.cpu_count(logical=True) or 2
    physical = psutil.cpu_count(logical=False) or logical

    tier = _pick_tier(ram_available_mb, disk_free_gb)
    threads = _pick_threads(logical)
    ctx = _pick_ctx(ram_available_mb)

    return SystemProfile(
        os=platform.system(),
        arch=platform.machine(),
        cpu_cores_physical=physical,
        cpu_cores_logical=logical,
        ram_total_mb=ram_total_mb,
        ram_available_mb=ram_available_mb,
        disk_free_gb=disk_free_gb,
        has_avx2=_has_avx2(),
        has_cuda=_has_cuda(),
        tier=tier,
        recommended_threads=threads,
        recommended_ctx=ctx,
    )


def live_ram_mb() -> tuple[int, int]:
    """Return (available_mb, total_mb) right now — used by the optimizer."""
    vmem = psutil.virtual_memory()
    return int(vmem.available / (1024 * 1024)), int(vmem.total / (1024 * 1024))
