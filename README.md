# IntelliYash — A Self-Optimizing Local AI Studio

A zero-config local AI runtime that picks the right model for *your* hardware,
*your* prompt, and gets out of the way. Designed for low-end machines (2 GB RAM
target) and built so a non-technical user never has to touch a CLI.

## Why this exists

Tools like Ollama and LM Studio are great, but they still ask the user to:
- pick a model
- understand quantization
- manage downloads
- read logs when things break

IntelliYash makes those decisions for you:
1. Detects RAM, CPU cores, free disk.
2. Picks a tier (`tiny` / `mini` / `medium`) automatically.
3. Routes each prompt by intent (chat / code / long-doc) to the right model.
4. Downloads, loads, unloads, and frees memory in the background.
5. Falls back to a cloud key only if the user explicitly enables it.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js frontend (chat / models / settings)                    │
│              ↓ REST + SSE                                        │
│  FastAPI backend                                                 │
│   ├─ SystemDetector      — RAM/CPU/disk probe (psutil)          │
│   ├─ ModelRegistry       — curated GGUF models per tier         │
│   ├─ ModelManager        — download / load / unload via         │
│   │                        llama-cpp-python                      │
│   ├─ ModelRouter         — intent classifier → tier+task        │
│   ├─ Optimizer           — RAM watcher, idle unloader            │
│   ├─ HealthMonitor       — auto-restart on crash                 │
│   └─ SQLite + ChromaDB   — chat history + optional RAG          │
└─────────────────────────────────────────────────────────────────┘
```

## Quick start

```bash
# Linux / macOS
./setup.sh

# Windows
setup.bat
```

Then open http://localhost:3000.

That's it. No model picker, no settings, no GPU questions.

## Project layout

```
intelliyash/
├── backend/                # FastAPI service
│   ├── app/
│   │   ├── main.py             # App entry + lifespan
│   │   ├── config.py           # Settings (env-driven)
│   │   ├── core/
│   │   │   ├── system_detector.py
│   │   │   ├── model_registry.py
│   │   │   ├── model_manager.py
│   │   │   ├── model_router.py
│   │   │   └── optimizer.py
│   │   ├── api/
│   │   │   ├── chat.py
│   │   │   ├── models.py
│   │   │   ├── system.py
│   │   │   └── health.py
│   │   ├── db/
│   │   │   └── database.py
│   │   └── services/
│   │       └── llm_service.py
│   ├── requirements.txt
│   └── run.py
├── frontend/               # Next.js 14 app router
│   ├── app/
│   │   ├── page.tsx            # Chat
│   │   ├── models/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   ├── lib/api.ts
│   ├── package.json
│   └── tailwind.config.ts
├── scripts/
│   └── healthcheck.py
├── intelliyash_builder.py  # bootstraps everything
├── setup.sh / setup.bat    # one-command install + run
├── deploy.py               # GitHub + Render + Vercel
├── test_system.py          # E2E test
└── README.md
```

## What's honest about this scaffold

- **Real and working:** the backend, frontend, system detection, model
  registry, manager, router, chat persistence, setup scripts, and tests
  are full implementations.
- **Needs your config:** `deploy.py` needs your GitHub / Render / Vercel
  tokens. The cloud fallback in the router needs an API key set in
  Settings. These are documented inline.
- **First model download is online.** Once cached locally, the system runs
  fully offline.

See `docs/ARCHITECTURE.md` for deeper details.
