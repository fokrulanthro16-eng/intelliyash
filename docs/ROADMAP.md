# IntelliYash — Development Roadmap

**Tagline:** "Local AI that runs where others struggle."
**Positioning:** Ollama gives you local models. IntelliYash gives you a local AI operating system.

---

## Discipline Rules

- Each step is small, testable, and reversible.
- Never break existing chat / models / settings / system pages.
- No step touches more than 2–3 files unless unavoidable.
- Every step ships something visible to the user.

---

## PHASE 1 — Foundation

### STEP 1 — Stabilize ✅ DONE
Files changed: `main.py`, `api/chat.py`, `lib/api.ts`, `app/page.tsx`

- Registered all API routers (models, settings, system, health)
- Fixed double-prefix bug on health router
- Added startup lifespan (init_db, service.boot, load_persisted)
- Replaced mock chat with real LLMService.chat_stream()
- Added all missing TypeScript types and API functions
- Removed duplicate sidebar from chat page

---

### STEP 2 — Memory Guard
**Goal:** Block unsafe model loads. Never OOM the user's machine.

Files: `core/system_detector.py`, `core/model_manager.py`, `api/models.py`, `frontend/app/models/page.tsx`

What to build:
- Before any load: compare `model.runtime_ram_mb` vs `available_ram_mb - safety_margin`
- If unsafe: raise `MemoryGuardError` with a clear message
- API returns structured `{"safe": false, "reason": "...", "available_mb": X, "needed_mb": Y}`
- Frontend shows a dismissable warning card instead of silently failing

Example output to user:
```
⚠ Cannot load Qwen2.5 3B — needs ~3200 MB, only 2100 MB available.
Recommended safe model: Qwen2.5 1.5B (needs ~1800 MB).
```

---

### STEP 3 — System Transparency Panel
**Goal:** Frontend shows live RAM, loaded model, tokens/sec, context size.

Files: `frontend/app/page.tsx`, `frontend/components/Sidebar.tsx`, `api/health.py`

What to build:
- Health endpoint adds `tokens_per_sec` (tracked by ModelManager during generation)
- Chat header shows: model name + task + tokens/sec after each reply
- Sidebar bottom panel shows: RAM bar (available / total), tier badge, loaded model
- All values poll `/api/health` every 3s

---

## PHASE 2 — Smart Operation

### STEP 4 — Idle Unload + Context Compression
**Goal:** Auto free RAM when idle. Keep memory lean for long conversations.

Files: `core/optimizer.py`, `services/llm_service.py`

What to build:
- Background thread in `optimizer.py` polls `manager.idle_seconds` every 30s
- If `idle_seconds > settings.idle_unload_seconds`: unload model, log it
- Context compression: when conversation history exceeds N messages, summarize
  the oldest half with a tiny model before sending to the main model
- Frontend shows "Model unloaded (idle)" badge in sidebar

---

### STEP 5 — Auto Optimization Engine
**Goal:** Auto-tune threads, context, batch, GPU layers based on hardware.

Files: `core/system_detector.py`, `core/model_manager.py`, `api/settings.py`

What to build:
- `optimize_load_params(spec, profile)` function:
  - threads = min(physical_cores, recommended_threads)
  - ctx: scale down if available RAM < spec.runtime_ram_mb * 1.3
  - n_batch: 128 on low RAM, 512 on high RAM
  - n_gpu_layers: if CUDA detected, set to 20+; else 0
- Applied automatically on every load call
- Settings page shows what was auto-chosen and why

---

### STEP 6 — Self-Healing Engine
**Goal:** Survive failures gracefully. Never crash silently. Always explain to user.

Files: `services/llm_service.py`, `api/chat.py`

What to build:
- On `ModelLoadError`: step down to next smaller tier, stream a message explaining
- On OOM signal (load fails with RAM error): reduce ctx by 50%, retry once
- On generation crash: stream `"[Recovery] Generation failed — retrying with smaller context…"` then retry
- On all fallbacks exhausted: stream a clear final message:
  `"All local models failed on this hardware. Consider enabling cloud fallback in Settings."`
- Every recovery action is logged with reason

---

## PHASE 3 — API Compatibility

### STEP 7 — Ollama + OpenAI API Compatibility
**Goal:** Drop-in replacement for tools that already talk to Ollama or OpenAI.

Files: `api/ollama_compat.py` (new), `api/openai_compat.py` (new), `main.py`

Ollama endpoints:
- `GET  /api/tags`                → list models
- `POST /api/generate`            → streaming generate (Ollama format)
- `POST /api/chat`                → streaming chat (Ollama format)

OpenAI endpoints:
- `GET  /v1/models`               → list models
- `POST /v1/chat/completions`     → streaming chat (OpenAI format)

Response format mapping:
- Ollama: `{"model": "...", "response": "...", "done": false}`
- OpenAI: `{"choices": [{"delta": {"content": "..."}}]}`

---

## PHASE 4 — Intelligence Layer

### STEP 8 — Performance Learning
**Goal:** Track how each model performs on this specific machine. Recommend better ones.

Files: `db/database.py`, `core/model_manager.py`, `api/models.py`

What to build:
- DB table `model_stats`: model_id, tokens_per_sec, load_time_ms, fail_count, last_used
- `ModelManager` writes stats after each generation
- `GET /api/models` includes per-model stats
- Models page shows "X tok/s on your device" under each model
- Router uses stats to prefer faster models when multiple fit the tier

---

### STEP 9 — Task Memory
**Goal:** Learn what the user works on. Improve routing over time.

Files: `services/llm_service.py`, `db/database.py`

What to build:
- Track intent counts per user: `{code: 42, chat: 18, reasoning: 7}`
- Stored in `settings_kv` as JSON per user
- After 20 messages: dominant intent shifts default routing
  (e.g., if 70%+ of messages are code → always start with coder model)
- Settings page shows: "Your usage profile: code-heavy → using Coder model by default"

---

### STEP 10 — Debug Mode
**Goal:** When user pastes an error/traceback, automatically analyze it.

Files: `services/llm_service.py`

What to build:
- Detect traceback/error patterns in user message
- Prefix system prompt with debug context:
  `"You are a debugging assistant. Analyze the error, identify the root cause, and suggest a fix."`
- Route to coder model regardless of tier
- Reply always includes: Cause / Fix / Code patch (if applicable)

---

### STEP 11 — Permission System
**Goal:** Never take destructive actions without explicit user approval.

Files: `services/tools.py`, `api/chat.py`, `frontend/app/page.tsx`

What to build:
- Tools that write/delete files or execute commands emit a `"permission_request"` event
- Frontend shows an approval card: `"Agent wants to write: /path/to/file — Allow?"`
- User clicks Allow or Deny
- Only on Allow does the tool execute
- All approved actions written to `data/audit_log.jsonl`

---

## PHASE 5 — Developer Platform

### STEP 12 — Codebase Awareness + Smart File Search
**Goal:** User selects a project folder. Agent can read, explain, and analyze it.

Files: `services/tools.py`, `api/tools.py` (new), `frontend/app/tools/page.tsx` (new)

What to build:
- `open_workspace(path)` tool: indexes file tree, stores in memory
- `search_codebase(query)` tool: grep-style search across workspace
- `explain_file(path)` tool: read file + ask model to explain
- `find_bugs(path)` tool: read file + ask model to review for issues
- Frontend: Workspace panel with folder picker, file tree, search box
- All file operations go through `safe_path()` to prevent traversal

---

### STEP 13 — Plan → Execute Mode
**Goal:** For complex tasks, plan first, ask for approval, then execute step by step.

Files: `services/llm_service.py`, `api/chat.py`, `frontend/app/page.tsx`

What to build:
- Trigger word: `"plan and build: ..."` or multi-step task detection
- Phase 1: Stream a numbered plan to the user
- Stream a `"plan_approval"` event → frontend shows "Proceed?" card
- On approval: execute each step, streaming progress:
  `"Step 2/5: Writing backend/app/api/auth.py…"`
- On any step failure: pause, show error, ask "Retry / Skip / Cancel"

---

### STEP 14 — Offline Knowledge Packs
**Goal:** Install local documentation for offline RAG.

Files: `services/rag_service.py` (new), `api/settings.py`

What to build:
- Pack format: a folder of `.md` or `.txt` docs chunked and embedded into ChromaDB
- Available packs: Python stdlib, FastAPI, React, Next.js, llama.cpp
- Install pack: download docs → chunk → embed → store in `data/chroma/`
- On each chat: query ChromaDB for relevant chunks → inject into system prompt
- Settings page shows: installed packs, total chunks, disk usage

---

## PHASE 6 — Platform Features

### STEP 15 — Visible Execution Status
**Goal:** User always knows exactly what the agent is doing.

Files: `api/chat.py`, `frontend/app/page.tsx`

What to build:
- Add `"status"` events from `LLMService`: `thinking / planning / tool_call / file_read / done`
- Frontend renders a status ticker below the input:
  `● Thinking…`  →  `● Using tool: calculator`  →  `● Writing file`  →  `✓ Done`
- Status clears after 2s on completion

---

### STEP 16 — Benchmark System
**Goal:** Measure model performance on this machine.

Files: `api/models.py`, `core/model_manager.py`, `frontend/app/models/page.tsx`

What to build:
- `POST /api/models/{id}/benchmark`: runs a fixed 50-token generation 3 times
- Records: avg tokens/sec, load time, peak RAM, pass/fail
- Models page shows benchmark results with a "Run benchmark" button
- Results stored in `model_stats` table

---

### STEP 17 — Workspace System
**Goal:** Multiple isolated workspaces, each with own memory, settings, model preference.

Files: `db/database.py`, `api/settings.py`, `frontend/app/settings/page.tsx`

What to build:
- DB table `workspaces`: id, name, model_preference, tool_permissions, created_at
- Each chat session belongs to a workspace
- Workspace switcher in sidebar
- Each workspace has its own chat history, task memory, and file permissions

---

### STEP 18 — Plugin System
**Goal:** Allow custom tools to be added without modifying core code.

Files: `services/tools.py`, `api/tools.py`

What to build:
- Plugin format: a single Python file with `TOOL_ID`, `TOOL_DESCRIPTION`, `run(input: str) -> str`
- Drop plugin files into `data/plugins/`
- `ToolService` scans that folder on startup and registers all plugins
- Plugins appear in the Tools page
- Dangerous plugins require capability flags (`file_write`, `command_exec`, `network`)

---

## Quick Reference — Feature → Step

| Feature | Step |
|---------|------|
| Memory Guard | 2 |
| System Transparency | 3 |
| Idle Unload | 4 |
| Context Compression | 4 |
| Auto Optimization | 5 |
| Self-Healing Engine | 6 |
| Ollama API compat | 7 |
| OpenAI API compat | 7 |
| Performance Learning | 8 |
| Task Memory | 9 |
| Debug Mode | 10 |
| Permission System | 11 |
| Codebase Awareness | 12 |
| Smart File Search | 12 |
| Plan → Execute | 13 |
| Offline Knowledge Packs | 14 |
| Visible Execution Status | 15 |
| Benchmark System | 16 |
| Workspace System | 17 |
| Plugin System | 18 |
| Cloud Fallback (optional) | existing |
| Tool-First Agent | existing |
| Model Packs UX | 2 (piggyback) |
| Beginner-Friendly UX | 2 (piggyback) |
