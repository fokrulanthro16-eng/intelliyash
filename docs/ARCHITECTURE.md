# IntelliYash — Architecture

This document explains *why* the system is shaped the way it is. Code-level
docstrings cover the *how*.

## 1. Goals (in priority order)

1. **Run on a 2 GB RAM machine without the user knowing what a quant is.**
2. **Zero-config first launch.** Open the app, type a message, get a reply.
3. **Pick the right model per request.** Coding question → coding model.
   Long doc → larger context. Chat → fastest model that still feels good.
4. **Stay polite to the OS.** Free RAM when idle, never crash the host.
5. **Be inspectable.** Every routing decision is logged in `meta.reason`.

## 2. Component map

```
                                        ┌───────────────────────┐
                                        │  Next.js (frontend)   │
                                        │  pages: /, /models,   │
                                        │  /settings            │
                                        └──────────┬────────────┘
                                                   │  REST + SSE
                                                   ▼
              ┌──────────────────────────────────────────────────┐
              │  FastAPI (backend)                              │
              │                                                 │
              │  api.chat ──┐                                   │
              │  api.models ─┼─► services.LLMService            │
              │  api.system ─┘       │                          │
              │                      ▼                          │
              │              core.ModelRouter ──► core.ModelRegistry
              │                      │                          │
              │                      ▼                          │
              │              core.ModelManager (Llama)          │
              │                      │                          │
              │                      ▼                          │
              │              llama.cpp (GGUF) on CPU            │
              │                                                 │
              │  core.Optimizer (background asyncio task)       │
              │  core.SystemDetector (psutil)                   │
              │  db.SQLite (chats, messages, settings)          │
              │  db.ChromaDB (RAG, optional)                    │
              └──────────────────────────────────────────────────┘
```

## 3. Hardware tiering

`SystemDetector.detect_system()` returns a `SystemProfile` with a `tier` of
`tiny | mini | medium | large`. Thresholds:

| Tier   | RAM available  | Default model         | RAM at runtime |
| ------ | -------------- | --------------------- | -------------- |
| tiny   | < 1.5 GB       | Qwen2.5 0.5B Q4       | ~0.9 GB        |
| mini   | 1.5 – 2.8 GB   | Qwen2.5 1.5B Q4       | ~1.8 GB        |
| medium | 2.8 – 5.5 GB   | Qwen2.5 3B Q4         | ~3.2 GB        |
| large  | ≥ 5.5 GB       | Qwen2.5 7B Q4         | ~6.5 GB        |

Thresholds are *available* RAM, not total — a Chrome-laden 8 GB laptop with
1 GB free is correctly treated as `tiny`. We re-detect on `/api/system/redetect`.

## 4. Routing

`ModelRouter.decide()` runs:

```python
task = classify_intent(last_user_message)   # chat | code | reasoning
spec = registry.select(profile.tier, task)
return RouteDecision(spec, task, reason)
```

The intent classifier is a regex over the last user message. It's stupid
on purpose — fast, deterministic, easy to debug, free of self-referential
loops where the LLM helps decide which LLM to call. False positives are
fine; the worst case is loading a coder model for a chat question.

If the chosen tier doesn't have a model for the task (e.g. `tiny + code`),
`registry.select()` falls back: same tier + chat, then step down a tier,
then ultimately tiny chat.

## 5. Memory lifecycle

```
                     idle > 5min           emergency: free < 300 MB
ModelManager.load() ────────────► unload  ◄────── Optimizer tick
                                                   │
ModelManager.touch()   ←── on every chat token ────┘
```

At most one `Llama` instance lives in memory. Before loading a new one we
unload the current. The Optimizer runs every 10 s and unloads on either
condition.

## 6. Self-healing

The builder script restarts on crash by virtue of the surrounding process
manager (e.g. `setup.sh` invokes `python intelliyash_builder.py`, which
`Popen`s subprocesses and detects exit codes). If a model load fails (e.g.
HF rate-limit, corrupted file), `LLMService._ensure_loaded` walks the tier
ladder downward until something loads or it gives up cleanly with an SSE
`error` event.

## 7. Cloud fallback

Off by default. Setting:

```
INTELLIYASH_ENABLE_CLOUD_FALLBACK=true
INTELLIYASH_CLOUD_API_KEY=<your key>
```

…or toggling the same in `/settings` makes the router prefer cloud only
when (a) the user opted in *and* (b) the request is heavy (> 6 KB of
context, or task=`reasoning`). API key is held in process memory and
never written to SQLite.

## 8. Data layer

* SQLite (`backend/data/intelliyash.sqlite3`): chats, messages, settings KV.
* ChromaDB (`backend/data/chroma`): optional RAG index. Wiring is in
  `requirements.txt`; an `/api/rag` endpoint is the next obvious add.

## 9. What's deliberately not here

* **GPU support.** The CPU path is the only path that's universally
  testable on a 2 GB target. llama-cpp-python supports CUDA/Metal — building
  with those flags is a deployment-time decision.
* **A model picker.** The `Models` page exists for power users, but the
  Grandma path never visits it.
* **Chat-history-aware routing.** A multi-turn chat that drifts from `chat`
  to `code` will keep the chat model. We trade a tiny quality loss for not
  hot-swapping models mid-conversation.
