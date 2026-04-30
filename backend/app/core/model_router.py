"""ModelRouter — picks the right model for each request.

Routing inputs:
  - the user's message (intent classification)
  - the current SystemProfile (RAM tier)
  - the user's settings (cloud fallback, force-task)

Output: a ModelSpec ready for ModelManager to load.

We deliberately use a dumb keyword classifier here rather than calling another
model. It's fast, deterministic, debuggable, and good enough — and it's
exactly the kind of thing the user shouldn't have to think about.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal, Optional

from app.core import model_registry
from app.core.model_registry import ModelSpec, Task, Tier
from app.core.system_detector import SystemProfile


@dataclass
class RouteDecision:
    spec: ModelSpec
    task: Task
    reason: str
    use_cloud: bool = False


_CODE_PATTERNS = [
    r"\bdef\s+\w+\s*\(",
    r"\bclass\s+\w+\s*[:\(]",
    r"\bfunction\s+\w+\s*\(",
    r"\bimport\s+\w+",
    r"\bconst\s+\w+\s*=",
    r"```",
    r"\bregex\b",
    r"\bSQL\b|\bSELECT\b.*\bFROM\b",
    r"\b(stack ?trace|null pointer|segmentation fault)\b",
    r"\b(python|javascript|typescript|java|c\+\+|rust|go|kotlin|swift)\b",
    r"\b(bug|debug|error|exception|compile|runtime error)\b",
    r"\b(api|endpoint|route|handler|middleware)\b",
    r"\b(refactor|implement|write a (function|script|class))\b",
]
_CODE_RE = re.compile("|".join(_CODE_PATTERNS), re.IGNORECASE)


_REASONING_PATTERNS = [
    r"\b(why|how come|explain|reason|prove|derive)\b",
    r"\b(step[- ]by[- ]step|analyze|compare|contrast)\b",
    r"\b(theorem|proof|equation|integral|derivative)\b",
    r"\b(plan|strategy|trade[- ]off|architecture)\b",
]
_REASONING_RE = re.compile("|".join(_REASONING_PATTERNS), re.IGNORECASE)


def classify_intent(message: str) -> Task:
    """Classify a single message into chat / code / reasoning."""
    text = message or ""
    if _CODE_RE.search(text):
        return "code"
    if _REASONING_RE.search(text) and len(text) > 80:
        return "reasoning"
    return "chat"


def _is_long_doc(messages: list[dict]) -> bool:
    """Heuristic: total prompt length suggests we should use a bigger ctx."""
    total = sum(len(m.get("content", "") or "") for m in messages)
    return total > 6000


class Router:
    """Routes (system, settings, request) → ModelSpec."""

    def __init__(self, system: SystemProfile) -> None:
        self.system = system

    def update_system(self, system: SystemProfile) -> None:
        self.system = system

    def decide(
        self,
        messages: list[dict],
        force_task: Optional[Task] = None,
        prefer_cloud: bool = False,
    ) -> RouteDecision:
        last_user_msg = next(
            (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"),
            "",
        )
        task = force_task or classify_intent(last_user_msg)

        # Cloud preference: only honor it if the request is heavy and the user
        # has explicitly enabled cloud fallback at the API level.
        use_cloud = bool(prefer_cloud and (_is_long_doc(messages) or task == "reasoning"))

        spec = model_registry.select(self.system.tier, task)
        reason = (
            f"intent={task}; tier={self.system.tier}; "
            f"ram_avail={self.system.ram_available_mb}MB; "
            f"chose={spec.id}"
        )
        return RouteDecision(spec=spec, task=task, reason=reason, use_cloud=use_cloud)
