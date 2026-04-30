"""ModelRegistry — the curated list of GGUF models IntelliYash will use.

We deliberately keep this list short and opinionated. The Grandma Theory says
the user shouldn't *choose* a model, so we choose one good model per
(tier, task) combination and stop there.

All models are gguf, Q4_K_M unless noted, and live on Hugging Face.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


Task = Literal["chat", "code", "reasoning"]
Tier = Literal["tiny", "mini", "medium", "large"]


@dataclass(frozen=True)
class ModelSpec:
    """A single downloadable GGUF model."""
    id: str                       # internal stable id
    display_name: str             # what we show users
    repo_id: str                  # HF repo
    filename: str                 # GGUF filename inside the repo
    size_mb: int                  # approximate on-disk size
    runtime_ram_mb: int           # rough working-set RAM at default ctx
    tier: Tier
    tasks: tuple[Task, ...]
    chat_format: str = "chatml"   # default; passed to llama_cpp
    description: str = ""


REGISTRY: list[ModelSpec] = [
    # --- TINY (≤ 1.5 GB RAM) -----------------------------------------------
    ModelSpec(
        id="qwen2.5-0.5b-instruct-q4",
        display_name="Qwen2.5 0.5B Instruct",
        repo_id="Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        filename="qwen2.5-0.5b-instruct-q4_k_m.gguf",
        size_mb=395,
        runtime_ram_mb=900,
        tier="tiny",
        tasks=("chat", "reasoning"),
        chat_format="chatml",
        description="General chat that fits in a phone-grade RAM budget.",
    ),

    # --- MINI (≤ 2.8 GB RAM) -----------------------------------------------
    ModelSpec(
        id="qwen2.5-1.5b-instruct-q4",
        display_name="Qwen2.5 1.5B Instruct",
        repo_id="Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        filename="qwen2.5-1.5b-instruct-q4_k_m.gguf",
        size_mb=1020,
        runtime_ram_mb=1800,
        tier="mini",
        tasks=("chat", "reasoning"),
        chat_format="chatml",
        description="Solid general-purpose chat for ~3 GB systems.",
    ),
    ModelSpec(
        id="qwen2.5-coder-1.5b-q4",
        display_name="Qwen2.5 Coder 1.5B",
        repo_id="Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF",
        filename="qwen2.5-coder-1.5b-instruct-q4_k_m.gguf",
        size_mb=1020,
        runtime_ram_mb=1800,
        tier="mini",
        tasks=("code",),
        chat_format="chatml",
        description="Coding-tuned variant for the same RAM budget.",
    ),

    # --- MEDIUM (≤ 5.5 GB RAM) ---------------------------------------------
    ModelSpec(
        id="qwen2.5-3b-instruct-q4",
        display_name="Qwen2.5 3B Instruct",
        repo_id="Qwen/Qwen2.5-3B-Instruct-GGUF",
        filename="qwen2.5-3b-instruct-q4_k_m.gguf",
        size_mb=1980,
        runtime_ram_mb=3200,
        tier="medium",
        tasks=("chat", "reasoning"),
        chat_format="chatml",
        description="Best general model for ~6 GB systems.",
    ),
    ModelSpec(
        id="qwen2.5-coder-3b-q4",
        display_name="Qwen2.5 Coder 3B",
        repo_id="Qwen/Qwen2.5-Coder-3B-Instruct-GGUF",
        filename="qwen2.5-coder-3b-instruct-q4_k_m.gguf",
        size_mb=1980,
        runtime_ram_mb=3200,
        tier="medium",
        tasks=("code",),
        chat_format="chatml",
        description="Coding model for ~6 GB systems.",
    ),

    # --- LARGE (8 GB+) -----------------------------------------------------
    ModelSpec(
        id="qwen2.5-7b-instruct-q4",
        display_name="Qwen2.5 7B Instruct",
        repo_id="Qwen/Qwen2.5-7B-Instruct-GGUF",
        filename="qwen2.5-7b-instruct-q4_k_m.gguf",
        size_mb=4680,
        runtime_ram_mb=6500,
        tier="large",
        tasks=("chat", "reasoning"),
        chat_format="chatml",
        description="Full quality general model. Needs >= 8 GB RAM.",
    ),
    ModelSpec(
        id="qwen2.5-coder-7b-q4",
        display_name="Qwen2.5 Coder 7B",
        repo_id="Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
        filename="qwen2.5-coder-7b-instruct-q4_k_m.gguf",
        size_mb=4680,
        runtime_ram_mb=6500,
        tier="large",
        tasks=("code",),
        chat_format="chatml",
        description="Full quality coding model. Needs >= 8 GB RAM.",
    ),
]


def all_models() -> list[ModelSpec]:
    return list(REGISTRY)


def get_by_id(model_id: str) -> ModelSpec | None:
    return next((m for m in REGISTRY if m.id == model_id), None)


def select(tier: Tier, task: Task) -> ModelSpec:
    """Pick the best model for a (tier, task). Falls back to chat if needed."""
    # 1. Exact tier + task
    candidates = [m for m in REGISTRY if m.tier == tier and task in m.tasks]
    if candidates:
        return candidates[0]
    # 2. Same tier, fall back to chat
    candidates = [m for m in REGISTRY if m.tier == tier and "chat" in m.tasks]
    if candidates:
        return candidates[0]
    # 3. Step down a tier
    order = ["large", "medium", "mini", "tiny"]
    if tier in order:
        idx = order.index(tier)
        for lower in order[idx + 1:]:
            cands = [m for m in REGISTRY if m.tier == lower and task in m.tasks]
            if cands:
                return cands[0]
            cands = [m for m in REGISTRY if m.tier == lower and "chat" in m.tasks]
            if cands:
                return cands[0]
    # 4. Last resort: tiny chat.
    return [m for m in REGISTRY if m.tier == "tiny" and "chat" in m.tasks][0]
