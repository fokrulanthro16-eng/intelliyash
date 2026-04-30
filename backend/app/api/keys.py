"""IntelliYash local API key management + OpenAI-compatible /v1/ endpoints."""
from __future__ import annotations

import json
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator, Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# ── Storage ───────────────────────────────────────────────────────────────

_DATA_DIR  = Path(__file__).resolve().parents[2] / "data"
_KEYS_FILE = _DATA_DIR / "api_keys.json"
_lock      = threading.Lock()


def _load_keys() -> list[dict]:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    try:
        return json.loads(_KEYS_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def _save_keys(keys: list[dict]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _KEYS_FILE.write_text(json.dumps(keys, indent=2), encoding="utf-8")


# ── Key management router ─────────────────────────────────────────────────

router = APIRouter(prefix="/api/keys", tags=["keys"])


class CreateKeyRequest(BaseModel):
    name: str = "default"


@router.post("/create")
def create_key(req: CreateKeyRequest) -> dict:
    with _lock:
        keys = _load_keys()
        record = {
            "id":         secrets.token_hex(8),
            "name":       req.name,
            "key":        "iy-" + secrets.token_urlsafe(32),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        keys.append(record)
        _save_keys(keys)
    return record          # returns the full key once — client must copy it


@router.get("")
def list_keys() -> dict:
    keys = _load_keys()
    return {
        "keys": [
            {
                "id":          k["id"],
                "name":        k.get("name", ""),
                "key_preview": k["key"][:14] + "…",
                "created_at":  k.get("created_at", ""),
            }
            for k in keys
        ]
    }


@router.delete("/{key_id}")
def delete_key(key_id: str) -> dict:
    with _lock:
        keys = _load_keys()
        new = [k for k in keys if k["id"] != key_id]
        if len(new) == len(keys):
            raise HTTPException(status_code=404, detail="Key not found")
        _save_keys(new)
    return {"status": "deleted"}


class RenameKeyRequest(BaseModel):
    name: str


@router.patch("/{key_id}/rename")
def rename_key(key_id: str, req: RenameKeyRequest) -> dict:
    with _lock:
        keys = _load_keys()
        for k in keys:
            if k["id"] == key_id:
                new_name = req.name.strip()
                if new_name:
                    k["name"] = new_name
                _save_keys(keys)
                return {"status": "renamed", "id": key_id, "name": k["name"]}
        raise HTTPException(status_code=404, detail="Key not found")


# ── Auth dependency ───────────────────────────────────────────────────────

def _verify_key(authorization: Optional[str] = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Bearer token")
    token = authorization.split(" ", 1)[1].strip()
    keys = _load_keys()
    if not any(k["key"] == token for k in keys):
        raise HTTPException(status_code=401, detail="Invalid API key")
    return token


# ── /v1/ OpenAI-compatible router ─────────────────────────────────────────

v1_router = APIRouter(prefix="/v1", tags=["v1"])


class V1Message(BaseModel):
    role: str
    content: str


class V1ChatRequest(BaseModel):
    model:       str             = "intelliyash-local"
    messages:    list[V1Message]
    stream:      bool            = False
    max_tokens:  Optional[int]   = None
    temperature: Optional[float] = None


def _chat_chunk(content: str) -> str:
    import json as _j
    return "data: " + _j.dumps({
        "id":      "chatcmpl-iy",
        "object":  "chat.completion.chunk",
        "created": int(time.time()),
        "model":   "intelliyash-local",
        "choices": [{"delta": {"content": content}, "index": 0, "finish_reason": None}],
    }) + "\n\n"


@v1_router.post("/chat/completions")
async def v1_chat(req: V1ChatRequest, _key: str = Depends(_verify_key)):
    from app.services.llm_service import service
    import json as _j

    raw_messages = [{"role": m.role, "content": m.content} for m in req.messages]
    tokens: list[str] = []

    async def _gen() -> AsyncIterator[str]:
        async for event in service.chat_stream(raw_messages):
            if event.get("type") == "token" and event.get("content"):
                tokens.append(event["content"])
                yield _chat_chunk(event["content"])
        yield "data: [DONE]\n\n"

    if req.stream:
        return StreamingResponse(_gen(), media_type="text/event-stream")

    # Non-streaming: consume generator then return full response
    async for _ in _gen():
        pass
    content = "".join(tokens)
    return {
        "id":      "chatcmpl-iy",
        "object":  "chat.completion",
        "created": int(time.time()),
        "model":   "intelliyash-local",
        "choices": [
            {
                "message":       {"role": "assistant", "content": content},
                "index":         0,
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens":     0,
            "completion_tokens": len(content.split()),
            "total_tokens":      len(content.split()),
        },
    }


class V1CodeRequest(BaseModel):
    code: str


@v1_router.post("/explain-code")
def v1_explain(req: V1CodeRequest, _key: str = Depends(_verify_key)) -> dict:
    from app.services.tools import TOOLS
    return {"result": TOOLS["explain"](f"explain code: {req.code}")}


@v1_router.post("/fix-error")
def v1_fix(req: V1CodeRequest, _key: str = Depends(_verify_key)) -> dict:
    from app.services.tools import TOOLS
    return {"result": TOOLS["fix_error"](f"fix error: {req.code}")}
