"""LLMService — router + manager + memory + cloud fallback + AUTO BUILDER AGENT."""

from __future__ import annotations

import asyncio
import re
from typing import AsyncIterator, Optional, Any

import httpx
from loguru import logger

from app.config import settings
from app.core import system_detector
from app.core.model_manager import ModelLoadError, manager
from app.core.model_router import RouteDecision, Router
from app.core import model_registry
from app.services.tools import TOOLS


_SYSTEM_RE = re.compile(
    r"(?:"
    r"how much (?:ram|memory|disk|storage)|"
    r"(?:what(?:'?s| is)?|show|check|display) (?:my )?(?:ram|memory|cpu|processor|system|hardware|specs?|disk|storage)|"
    r"system (?:info|stats?|status|specs?|details?)|"
    r"(?:available|free|total|used) (?:ram|memory|disk|storage)|"
    r"(?:ram|memory|cpu|disk|storage) (?:usage|info|status|available|free|stats?|space)|"
    r"(?:my )?(?:cpu|processor) (?:info|usage|stats?|speed|cores?|details?)"
    r")",
    re.IGNORECASE,
)

_WORD_OPS = [
    (re.compile(r"\btimes\b", re.IGNORECASE), "*"),
    (re.compile(r"\bmultiplied by\b", re.IGNORECASE), "*"),
    (re.compile(r"\bdivided by\b", re.IGNORECASE), "/"),
    (re.compile(r"\bplus\b", re.IGNORECASE), "+"),
    (re.compile(r"\bminus\b", re.IGNORECASE), "-"),
    (re.compile(r"\bsquared\b", re.IGNORECASE), "**2"),
    (re.compile(r"\bcubed\b", re.IGNORECASE), "**3"),
]

_CODE_EXTRA_RE = re.compile(
    r"\bcode\b|\bjs\b|\btsx?\b|\bjsx?\b|\bsnippet\b|\bfunction\b|"
    r"\bimplement\b|\bfix\b|\brefactor\b|\brewrite\b|\bdebug\b|"
    r"\bhtml\b|\bcss\b|\bpython\b|\bbash\b|\bshell\b|"
    r"=>|#!\/|#include\b",
    re.IGNORECASE,
)

# Max user/assistant pairs kept in context before each model call.
_MAX_HISTORY_PAIRS = 4
# Tiny models get a hard cap on generation length.
_TINY_MAX_TOKENS = 256
# Rough safety headroom left for generation inside the context window.
_CTX_HEADROOM = 128
# Single message content is capped at this many chars before trimming history.
_MAX_MSG_CHARS = 8_000


def _trim_messages(messages: list[dict], max_pairs: int = _MAX_HISTORY_PAIRS) -> list[dict]:
    """Return system messages + the last `max_pairs` user/assistant exchanges."""
    system = [m for m in messages if m.get("role") == "system"]
    convo  = [m for m in messages if m.get("role") in ("user", "assistant")]
    trimmed = convo[-(max_pairs * 2):]
    # Always start on a user turn so the model doesn't see a dangling assistant msg.
    while trimmed and trimmed[0].get("role") != "user":
        trimmed = trimmed[1:]
    return system + trimmed


def _estimate_tokens(messages: list[dict]) -> int:
    """Very rough token estimate: 4 chars ≈ 1 token."""
    return sum(len(str(m.get("content", ""))) for m in messages) // 4


def _truncate_message_content(messages: list[dict], max_chars: int = _MAX_MSG_CHARS) -> list[dict]:
    """Truncate any single message whose content exceeds max_chars, keeping the tail."""
    out = []
    for m in messages:
        c = m.get("content", "")
        if isinstance(c, str) and len(c) > max_chars:
            m = {**m, "content": c[-max_chars:]}
        out.append(m)
    return out


def _pick_code_snippet(query: str) -> tuple[str, str]:
    """Return (lang, code_snippet). No model call — pure keyword logic."""
    q = query.lower()

    is_js = bool(re.search(r"\b(javascript|js|nodejs|node\.js|typescript|ts)\b", q))
    is_html = bool(re.search(r"\b(html|css)\b", q))
    is_bash = bool(re.search(r"\b(bash|shell|sh)\b", q))

    if is_js:
        lang = "js"
        snippet = "```js\nconsole.log('Hello, World!');\n```"
    elif is_html:
        lang = "html"
        snippet = (
            "```html\n<html>\n  <head><title>Page</title></head>\n"
            "  <body>\n    <h1>Hello World</h1>\n  </body>\n</html>\n```"
        )
    elif is_bash:
        lang = "bash"
        snippet = "```bash\n#!/bin/bash\necho 'Hello, World!'\n```"
    else:
        lang = "python"
        snippet = "```python\nprint('Hello, World!')\n```"

    if lang == "python":
        if "list" in q:
            snippet = (
                "```python\n"
                "my_list = [1, 2, 3]\n"
                "print(my_list)\n"
                "print(my_list[0])  # first item\n"
                "my_list.append(4)\n"
                "print(my_list)\n"
                "```"
            )
        elif "tuple" in q:
            snippet = "```python\nmy_tuple = (1, 2, 3)\nprint(my_tuple)\nprint(my_tuple[0])\n```"
        elif "dict" in q or "dictionary" in q:
            snippet = (
                "```python\n"
                "data = {'name': 'Alice', 'age': 30}\n"
                "print(data)\n"
                "print(data['name'])\n"
                "```"
            )
        elif any(w in q for w in ("add", "sum", "plus", "two number")):
            snippet = "```python\ndef add(a, b):\n    return a + b\n\nprint(add(1, 2))  # 3\n```"
        elif any(w in q for w in ("subtract", "minus", "difference")):
            snippet = "```python\ndef subtract(a, b):\n    return a - b\n\nprint(subtract(5, 3))  # 2\n```"
        elif any(w in q for w in ("multiply", "times", "product")):
            snippet = "```python\ndef multiply(a, b):\n    return a * b\n\nprint(multiply(3, 4))  # 12\n```"
        elif any(w in q for w in ("divide", "division")):
            snippet = (
                "```python\n"
                "def divide(a, b):\n"
                "    return a / b if b != 0 else 'division by zero'\n\n"
                "print(divide(10, 2))  # 5.0\n"
                "```"
            )
        elif any(w in q for w in ("fibonacci", "fib")):
            snippet = (
                "```python\n"
                "def fib(n):\n"
                "    a, b = 0, 1\n"
                "    for _ in range(n):\n"
                "        a, b = b, a + b\n"
                "    return a\n\n"
                "print([fib(i) for i in range(8)])\n"
                "```"
            )
        elif any(w in q for w in ("factorial",)):
            snippet = (
                "```python\n"
                "def factorial(n):\n"
                "    return 1 if n <= 1 else n * factorial(n - 1)\n\n"
                "print(factorial(5))  # 120\n"
                "```"
            )
        elif "while" in q:
            snippet = "```python\ni = 0\nwhile i < 5:\n    print(i)\n    i += 1\n```"
        elif any(w in q for w in ("for loop", "for ", "loop", "iterate", "range")):
            snippet = "```python\nfor i in range(5):\n    print(i)\n```"
        elif any(w in q for w in ("reverse", "palindrome")):
            snippet = "```python\ntext = 'hello'\nprint(text[::-1])  # olleh\n```"
        elif any(w in q for w in ("sort", "sorted", "order")):
            snippet = "```python\nnums = [3, 1, 4, 1, 5, 9]\nnums.sort()\nprint(nums)\n```"
        elif any(w in q for w in ("read file", "open file")):
            snippet = "```python\nwith open('file.txt', 'r') as f:\n    print(f.read())\n```"
        elif any(w in q for w in ("write file", "write to file", "save file")):
            snippet = "```python\nwith open('file.txt', 'w') as f:\n    f.write('Hello, file!')\n```"
        elif any(w in q for w in ("class", "object", "oop")):
            snippet = (
                "```python\n"
                "class Animal:\n"
                "    def __init__(self, name):\n"
                "        self.name = name\n"
                "    def speak(self):\n"
                "        return f'{self.name} speaks'\n\n"
                "print(Animal('Dog').speak())\n"
                "```"
            )
        elif any(w in q for w in ("try", "except", "exception", "error handling")):
            snippet = (
                "```python\n"
                "try:\n"
                "    result = 10 / 0\n"
                "except ZeroDivisionError as e:\n"
                "    print(f'Error: {e}')\n"
                "finally:\n"
                "    print('Done')\n"
                "```"
            )
        elif any(w in q for w in ("list comprehension", "comprehension")):
            snippet = "```python\nsquares = [x**2 for x in range(10)]\nprint(squares)\n```"
        elif any(w in q for w in ("input", "user input", "stdin")):
            snippet = "```python\nname = input('Your name: ')\nprint(f'Hello, {name}!')\n```"
        elif any(w in q for w in ("function", "def ")):
            snippet = "```python\ndef greet(name):\n    return f'Hello, {name}!'\n\nprint(greet('World'))\n```"
        elif any(w in q for w in ("if", "condition", "else")):
            snippet = (
                "```python\n"
                "x = 10\n"
                "if x > 5:\n"
                "    print('greater')\n"
                "elif x == 5:\n"
                "    print('equal')\n"
                "else:\n"
                "    print('less')\n"
                "```"
            )

    elif lang == "js":
        if any(w in q for w in ("add", "sum", "plus")):
            snippet = "```js\nfunction add(a, b) {\n  return a + b;\n}\nconsole.log(add(1, 2)); // 3\n```"
        elif any(w in q for w in ("subtract", "minus")):
            snippet = "```js\nconst subtract = (a, b) => a - b;\nconsole.log(subtract(5, 3)); // 2\n```"
        elif any(w in q for w in ("for loop", "loop", "iterate", "for ")):
            snippet = "```js\nfor (let i = 0; i < 5; i++) {\n  console.log(i);\n}\n```"
        elif any(w in q for w in ("foreach", "array", "list")):
            snippet = "```js\nconst items = [1, 2, 3];\nitems.forEach(item => console.log(item));\n```"
        elif any(w in q for w in ("fetch", "api", "request", "http")):
            snippet = (
                "```js\n"
                "fetch('https://api.example.com/data')\n"
                "  .then(r => r.json())\n"
                "  .then(data => console.log(data))\n"
                "  .catch(err => console.error(err));\n"
                "```"
            )
        elif any(w in q for w in ("async", "await", "promise")):
            snippet = (
                "```js\n"
                "async function getData(url) {\n"
                "  const res = await fetch(url);\n"
                "  return res.json();\n"
                "}\n"
                "```"
            )
        elif any(w in q for w in ("class", "object")):
            snippet = (
                "```js\n"
                "class Animal {\n"
                "  constructor(name) { this.name = name; }\n"
                "  speak() { console.log(`${this.name} speaks`); }\n"
                "}\n"
                "new Animal('Dog').speak();\n"
                "```"
            )
        elif any(w in q for w in ("reverse", "string")):
            snippet = "```js\nconst rev = s => s.split('').reverse().join('');\nconsole.log(rev('hello'));\n```"

    elif lang == "html":
        if "form" in q:
            snippet = (
                "```html\n"
                "<form>\n"
                "  <label>Name: <input type=\"text\" name=\"name\"></label>\n"
                "  <button type=\"submit\">Submit</button>\n"
                "</form>\n"
                "```"
            )
        elif any(w in q for w in ("button", "click")):
            snippet = "```html\n<button onclick=\"alert('Hello!')\">Click me</button>\n```"
        elif any(w in q for w in ("table", "grid")):
            snippet = (
                "```html\n"
                "<table border=\"1\">\n"
                "  <tr><th>Name</th><th>Age</th></tr>\n"
                "  <tr><td>Alice</td><td>30</td></tr>\n"
                "</table>\n"
                "```"
            )
        elif "css" in q or "style" in q:
            lang = "css"
            snippet = (
                "```css\n"
                "body {\n"
                "  font-family: sans-serif;\n"
                "  background: #f0f0f0;\n"
                "  color: #333;\n"
                "}\n"
                "```"
            )

    elif lang == "bash":
        if any(w in q for w in ("loop", "for")):
            snippet = "```bash\nfor i in {1..5}; do\n  echo \"$i\"\ndone\n```"
        elif any(w in q for w in ("read", "file")):
            snippet = "```bash\nwhile IFS= read -r line; do\n  echo \"$line\"\ndone < file.txt\n```"

    return lang, snippet


_MEMORY: dict[str, list[dict]] = {}


class LLMService:
    def __init__(self) -> None:
        self._router: Optional[Router] = None
        self._lock = asyncio.Lock()
        self._low_memory_mode: bool = False

    async def boot(self) -> None:
        import os
        profile = system_detector.detect_system()
        self._router = Router(profile)
        logger.info(f"System profile: {profile.to_dict()}")
        cloud_enabled = os.getenv("INTELLIYASH_ENABLE_CLOUD_FALLBACK", "false").lower() == "true"
        key_set = bool(
            os.getenv("INTELLIYASH_HF_TOKEN")
            or os.getenv("INTELLIYASH_CLOUD_API_KEY")
            or os.getenv("INTELLIYASH_OPENAI_API_KEY")
        )
        logger.info(
            f"[AGENT] cloud_enabled={str(cloud_enabled).lower()} "
            f"provider={os.getenv('INTELLIYASH_CLOUD_PROVIDER', 'huggingface')} "
            f"key_set={str(key_set).lower()}"
        )

    @property
    def router(self) -> Router:
        if self._router is None:
            raise RuntimeError("LLMService not booted")
        return self._router

    def get_memory(self, user_id: str = "default_user") -> list[dict]:
        return _MEMORY.get(user_id, [])

    def save_memory(self, user_id: str, messages: list[dict]) -> None:
        if user_id not in _MEMORY:
            _MEMORY[user_id] = []
        _MEMORY[user_id].extend(messages)
        _MEMORY[user_id] = _MEMORY[user_id][-20:]

    def _cloud_key_available(self) -> bool:
        provider = (settings.cloud_provider or "huggingface").lower()
        if provider == "huggingface":
            return True
        if provider == "openai":
            return bool(settings.openai_api_key)
        if provider == "gemini":
            return bool(settings.gemini_api_key)
        return bool(settings.cloud_api_key)

    def _smart_route(self, decision: RouteDecision) -> None:
        try:
            available_mb, _ = system_detector.live_ram_mb()
            needed_mb = decision.spec.runtime_ram_mb + settings.ram_safety_margin_mb
            if available_mb < needed_mb:
                tiny = model_registry.select("tiny", decision.task)
                logger.warning(
                    f"[ROUTER] low RAM ({available_mb} MB available, "
                    f"{needed_mb} MB needed) — downgrading "
                    f"{decision.spec.id} → {tiny.id}"
                )
                decision.spec = tiny
                decision.use_cloud = False
                decision.reason += f" → ram_downgrade={tiny.id}"
        except Exception as exc:
            logger.warning(f"[ROUTER] RAM check skipped: {exc}")

        if manager.is_downloaded(decision.spec):
            return

        all_specs = model_registry.all_models()

        for spec in all_specs:
            if manager.is_downloaded(spec) and decision.task in spec.tasks:
                logger.info(f"[INSTANT] {decision.spec.id} not downloaded — swapped to {spec.id}")
                decision.spec = spec
                decision.reason += f" → instant={spec.id}"
                return

        for spec in all_specs:
            if manager.is_downloaded(spec):
                logger.info(f"[INSTANT] no task-matched download — using {spec.id}")
                decision.spec = spec
                decision.reason += f" → instant_any={spec.id}"
                return

    def _find_spec_by_id(self, model_id: str) -> Any:
        if hasattr(model_registry, "get"):
            return model_registry.get(model_id)

        for attr in ["MODELS", "MODEL_SPECS", "CATALOG", "REGISTRY", "models"]:
            collection = getattr(model_registry, attr, None)

            if isinstance(collection, dict):
                if model_id in collection:
                    return collection[model_id]
                for spec in collection.values():
                    if getattr(spec, "id", None) == model_id:
                        return spec

            if isinstance(collection, list):
                for spec in collection:
                    if getattr(spec, "id", None) == model_id:
                        return spec

        raise ValueError(f"Unknown model id: {model_id}")

    async def _ensure_loaded(self, decision: RouteDecision) -> None:
        if manager.loaded and manager.loaded.id == decision.spec.id:
            return

        profile = self.router.system
        loop = asyncio.get_event_loop()

        try:
            await loop.run_in_executor(
                None,
                manager.load,
                decision.spec,
                profile.recommended_threads,
                profile.recommended_ctx,
            )
        except Exception as exc:
            logger.exception("Initial load failed; stepping down")

            tier_order = ["large", "medium", "mini", "tiny"]

            try:
                idx = tier_order.index(decision.spec.tier)
            except ValueError:
                idx = 0

            for lower in tier_order[idx + 1:]:
                fallback = model_registry.select(lower, decision.task)
                logger.warning(f"Trying fallback {fallback.id}")

                try:
                    await loop.run_in_executor(
                        None,
                        manager.load,
                        fallback,
                        profile.recommended_threads,
                        profile.recommended_ctx,
                    )
                    decision.spec = fallback
                    decision.reason += f" → fallback={fallback.id}"
                    return
                except Exception:
                    continue

            raise ModelLoadError(f"All fallbacks exhausted: {exc}") from exc

    def _fallback_response(self, task: str, messages: list[dict]) -> str:
        last = next(
            (m.get("content", "") for m in reversed(messages) if m.get("role") == "user"),
            "",
        )

        if task == "code":
            lang, snippet = _pick_code_snippet(last)
            logger.info(f"[AGENT] route=low_memory_code lang={lang}")
            return snippet

        return (
            "I'm running in low memory mode. I can still help with:\n"
            "- **Math**: try `2 + 2` or `10 / 5`\n"
            "- **System info**: try `system ram` or `cpu usage`\n\n"
            "For full AI responses, free up RAM and try again."
        )

    def _generate_project_preview(self, prompt: str) -> str:
        """Return a deterministic project generation preview. No disk writes here."""
        p = prompt.lower()
        if "todo" not in p:
            project_name = prompt.split(":", 1)[1].strip() if ":" in prompt else prompt.strip()
            project_name = project_name or "new-project"
        else:
            project_name = "todo-app"

        return f"""🚀 Project Generator Ready: {project_name}

This is the REAL GENERATOR mode preview.
No files were written yet from chat for safety.

Project Name:
- {project_name}

Tech Stack:
- Frontend: React + TypeScript
- Backend: FastAPI
- API: REST JSON
- Storage: in-memory todo list

Files that will be created:

backend/main.py
backend/requirements.txt
backend/README.md
frontend/package.json
frontend/index.html
frontend/src/main.tsx
frontend/src/App.tsx

Generated file contents:

```python
# backend/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Todo API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class Todo(BaseModel):
    text: str

todos: list[dict] = []

@app.get("/")
def root():
    return {{"message": "Todo API running"}}

@app.get("/todos")
def get_todos():
    return todos

@app.post("/todos")
def add_todo(todo: Todo):
    item = {{"id": len(todos) + 1, "text": todo.text, "done": False}}
    todos.append(item)
    return item

@app.delete("/todos/{{todo_id}}")
def delete_todo(todo_id: int):
    global todos
    todos = [t for t in todos if t["id"] != todo_id]
    return {{"ok": True}}
```

```txt
# backend/requirements.txt
fastapi
uvicorn
pydantic
```

```json
// frontend/package.json
{{
  "scripts": {{
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  }},
  "dependencies": {{
    "@vitejs/plugin-react": "latest",
    "vite": "latest",
    "react": "latest",
    "react-dom": "latest",
    "typescript": "latest"
  }},
  "devDependencies": {{}}
}}
```

```html
<!-- frontend/index.html -->
<div id="root"></div>
<script type="module" src="/src/main.tsx"></script>
```

```tsx
// frontend/src/main.tsx
import React from "react";
import {{ createRoot }} from "react-dom/client";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// frontend/src/App.tsx
import {{ useEffect, useState }} from "react";

type Todo = {{
  id: number;
  text: string;
  done: boolean;
}};

const API = "http://localhost:8000";

export default function App() {{
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");

  async function loadTodos() {{
    const res = await fetch(`${{API}}/todos`);
    setTodos(await res.json());
  }}

  async function addTodo() {{
    if (!text.trim()) return;
    await fetch(`${{API}}/todos`, {{
      method: "POST",
      headers: {{ "Content-Type": "application/json" }},
      body: JSON.stringify({{ text }})
    }});
    setText("");
    loadTodos();
  }}

  async function deleteTodo(id: number) {{
    await fetch(`${{API}}/todos/${{id}}`, {{ method: "DELETE" }});
    loadTodos();
  }}

  useEffect(() => {{
    loadTodos();
  }}, []);

  return (
    <main style={{{{ maxWidth: 600, margin: "40px auto", fontFamily: "Arial" }}}}>
      <h1>Todo App</h1>

      <div style={{{{ display: "flex", gap: 8 }}}}>
        <input
          value={{text}}
          onChange={{e => setText(e.target.value)}}
          placeholder="Write a todo..."
          style={{{{ flex: 1, padding: 10 }}}}
        />
        <button onClick={{addTodo}}>Add</button>
      </div>

      <ul>
        {{todos.map(todo => (
          <li key={{todo.id}} style={{{{ marginTop: 10 }}}}>
            {{todo.text}}
            <button onClick={{() => deleteTodo(todo.id)}} style={{{{ marginLeft: 10 }}}}>
              Delete
            </button>
          </li>
        ))}}
      </ul>
    </main>
  );
}}
```

Run Commands:

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

Next step:
Use `auto file write dao` to enable safe disk writing from the app.
"""

    def _real_generator_response(self, prompt: str) -> str:
        """Return direct project generator response for create project / real generator commands."""
        return self._generate_project_preview(prompt)

    def _planner(self, text: str) -> str:
        task = text.replace("plan:", "", 1).strip()
        return f"""PLAN FOR: {task}

1. Define the exact goal and required features.
2. Decide project structure and files.
3. Create backend logic if needed.
4. Create frontend UI if needed.
5. Add configuration and environment variables.
6. Add README usage instructions.
7. Test with local run commands.
8. Debug errors and refine.

Suggested next command:
build project: {task}
"""

    def _clean_python_code(self, text: str) -> str:
        return (
            text.replace("run python:", "")
            .replace("run python", "")
            .replace("execute python:", "")
            .replace("execute python", "")
            .replace("python:", "")
            .strip()
        )

    def _extract_calc_expr(self, text: str) -> Optional[str]:
        t = text.strip().lower().rstrip("?")
        for prefix in ("calculate", "calc:", "calc", "what's", "what is", "solve", "="):
            t = t.replace(prefix, "")
        for pattern, op in _WORD_OPS:
            t = pattern.sub(op, t)
        t = t.strip()
        return t if re.fullmatch(r"[\d\.\+\-\*/%\(\)\s]+", t) else None

    def _extract_file_path(self, text: str) -> Optional[str]:
        low = text.lower().strip()
        for p in [
            "read file:", "open file:", "show file:",
            "read file", "open file", "show file",
        ]:
            if low.startswith(p):
                return text[len(p):].strip()
        return None

    def _extract_write_payload(self, text: str):
        raw = text.strip()
        low = raw.lower()

        if low.startswith("write file:"):
            body = raw[len("write file:"):].strip()
            if "content:" in body.lower():
                parts = re.split(r"content:\s*", body, maxsplit=1, flags=re.IGNORECASE)
                if len(parts) == 2:
                    return "write_file", f"{parts[0].strip()}\nCONTENT:\n{parts[1].strip()}"

        if low.startswith("append file:"):
            body = raw[len("append file:"):].strip()
            if "content:" in body.lower():
                parts = re.split(r"content:\s*", body, maxsplit=1, flags=re.IGNORECASE)
                if len(parts) == 2:
                    return "append_file", f"{parts[0].strip()}\nCONTENT:\n{parts[1].strip()}"

        return None

    def _extract_system_query(self, text: str) -> bool:
        low = text.strip().lower()
        explicit = (
            "system info", "system stats", "system status", "system specs",
            "hardware info", "hardware specs",
            "show ram", "show memory", "show cpu", "show disk",
            "check ram", "check memory", "check cpu", "check disk",
            "cpu usage", "cpu info", "cpu stats", "cpu speed", "cpu cores",
            "disk usage", "disk space", "disk free", "disk info",
        )
        if any(low.startswith(p) or low == p for p in explicit):
            return True
        return bool(_SYSTEM_RE.search(text))

    def _detect_tool(self, text: str):
        raw = text.strip()
        low = raw.lower()

        if re.search(r"\b(ram|memory)\b", low):
            return "system_info", raw

        if low.startswith("build project:") or low.startswith("create project:"):
            return "builder", raw

        write_payload = self._extract_write_payload(raw)
        if write_payload:
            return write_payload

        if (
            low.startswith("run python")
            or low.startswith("execute python")
            or low.startswith("python:")
        ):
            return "python", self._clean_python_code(raw)

        file_path = self._extract_file_path(raw)
        if file_path:
            return "file", file_path

        if self._extract_system_query(raw):
            return "system_info", raw

        expr = self._extract_calc_expr(raw)
        if expr:
            return "calc", expr

        return None, None

    def _multi_step_agent(self, text: str):
        raw = text.strip()

        tool_keywords = (
            r"build project:|create project:|write file:|append file:|"
            r"read file:|open file:|show file:|run python:?|execute python:?|"
            r"python:|calculate|calc:|solve"
        )

        matches = list(re.finditer(tool_keywords, raw, flags=re.IGNORECASE))

        if not matches:
            tool, inp = self._detect_tool(raw)
            return [(tool, inp)] if tool and inp else []

        steps = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(raw) else len(raw)
            chunk = raw[start:end].strip()
            chunk = re.sub(r"^(then|and|,)\s*", "", chunk, flags=re.IGNORECASE).strip()

            tool, inp = self._detect_tool(chunk)
            if tool and inp:
                steps.append((tool, inp))

        return steps

    async def chat_stream(
        self,
        messages: list[dict],
        force_task: Optional[str] = None,
        prefer_cloud: bool = False,
    ) -> AsyncIterator[dict]:
        async with self._lock:
            if messages:
                last_user = str(messages[-1].get("content", ""))

                normalized_user = last_user.strip().lower()

                # explain code: — static analysis, no model needed
                if normalized_user.startswith("explain code:"):
                    logger.info("[AGENT] route=explain_code")
                    yield {"type": "meta", "model": "explain-agent", "reason": "explain_code"}
                    yield {"type": "token", "content": TOOLS["explain"](last_user)}
                    yield {"type": "done"}
                    return

                # fix error: — pattern-based error diagnosis
                if normalized_user.startswith("fix error:"):
                    logger.info("[AGENT] route=fix_error")
                    yield {"type": "meta", "model": "fix-agent", "reason": "fix_error"}
                    yield {"type": "token", "content": TOOLS["fix_error"](last_user)}
                    yield {"type": "done"}
                    return

                # Auto file write: writes project files to generated_projects/ on disk.
                if (normalized_user.startswith("auto file write")
                        or normalized_user.startswith("create project:")):
                    logger.info("[AGENT] route=auto_file_write")
                    yield {"type": "meta", "model": "auto_file_writer", "reason": "auto_file_write"}
                    yield {"type": "token", "content": TOOLS["auto_file_writer"](last_user)}
                    yield {"type": "done"}
                    return

                if last_user.lower().startswith("plan:"):
                    yield {"type": "meta", "model": "planner-agent", "reason": "planner"}
                    yield {"type": "token", "content": self._planner(last_user)}
                    yield {"type": "done"}
                    return

                steps = self._multi_step_agent(last_user)
                if steps:
                    tool_names = [s[0] for s in steps]
                    logger.info(f"[AGENT] route=tool tools={tool_names} input={last_user!r}")
                    yield {
                        "type": "meta",
                        "model": "auto-builder-agent",
                        "reason": f"tools={','.join(tool_names)}",
                    }

                    for tool, tool_input in steps:
                        if tool not in TOOLS:
                            yield {"type": "error", "error": f"Unknown tool: {tool}"}
                            return

                        try:
                            output = TOOLS[tool](tool_input)
                            tag = tool.upper().replace("_", "-")
                            yield {"type": "token", "content": f"[{tag}]\n{output}\n"}
                        except Exception as exc:
                            logger.warning(f"[AGENT] tool={tool} failed: {exc}")
                            yield {"type": "token", "content": f"[{tool.upper()} unavailable — {exc}]\n"}

                    yield {"type": "done"}
                    return

            user_id = "default_user"
            memory = self.get_memory(user_id)
            full_messages = _trim_messages(_truncate_message_content(memory + messages))

            decision = self.router.decide(
                full_messages,
                force_task=force_task,
                prefer_cloud=prefer_cloud,
            )

            if decision.task != "code" and not force_task and messages:
                _last = str(messages[-1].get("content", ""))
                if _CODE_EXTRA_RE.search(_last):
                    decision.task = "code"
                    decision.spec = model_registry.select(decision.spec.tier, "code")
                    decision.reason += " → extra_code_kw"

            if not prefer_cloud:
                self._smart_route(decision)

            if decision.use_cloud and settings.enable_cloud_fallback and self._cloud_key_available():
                logger.info("[AGENT] route=cloud_fallback (prefer_cloud)")
                yield {"type": "meta", "model": "cloud", "reason": decision.reason}

                response_text = ""
                async for token in self._cloud_fallback_stream(full_messages):
                    response_text += token
                    yield {"type": "token", "content": token}

                self.save_memory(
                    user_id,
                    messages + [{"role": "assistant", "content": response_text}],
                )
                yield {"type": "done"}
                return

            # Dynamic recovery: do not stay stuck in low-memory mode forever.
            try:
                _ram_avail, _ = system_detector.live_ram_mb()
                if _ram_avail > 900:
                    self._low_memory_mode = False
            except Exception:
                _ram_avail = 9999

            if self._low_memory_mode:
                logger.info("[AGENT] low_memory_mode=True — skipping model load")

                if settings.enable_cloud_fallback and self._cloud_key_available():
                    logger.info("[AGENT] route=cloud_fallback")
                    yield {"type": "meta", "model": "cloud", "reason": "low-memory-mode"}
                    try:
                        response_text = ""
                        async for token in self._cloud_fallback_stream(full_messages):
                            response_text += token
                            yield {"type": "token", "content": token}
                        self.save_memory(
                            user_id,
                            messages + [{"role": "assistant", "content": response_text}],
                        )
                        yield {"type": "done"}
                        return
                    except Exception as cloud_exc:
                        logger.warning(f"[AGENT] cloud fallback failed: {cloud_exc}")

                elif settings.enable_cloud_fallback and not self._cloud_key_available():
                    logger.warning("[AGENT] cloud_enabled=true but key not set")
                    yield {"type": "meta", "model": "fallback", "reason": "cloud-key-missing"}
                    yield {
                        "type": "token",
                        "content": (
                            "Cloud fallback is enabled but no API key is configured.\n\n"
                            "Set one of these in your `backend/.env` file:\n"
                            "- `INTELLIYASH_HF_TOKEN=hf_...` (HuggingFace)\n"
                            "- `INTELLIYASH_OPENAI_API_KEY=sk-...` + "
                            "`INTELLIYASH_CLOUD_PROVIDER=openai` (OpenAI)"
                        ),
                    }
                    yield {"type": "done"}
                    return

                logger.info("[AGENT] route=low_memory_fallback")
                yield {"type": "meta", "model": "fallback", "reason": "low-memory-mode"}
                yield {"type": "token", "content": self._fallback_response(decision.task, full_messages)}
                yield {"type": "done"}
                return

            try:
                _ram_avail, _ = system_detector.live_ram_mb()
            except Exception:
                _ram_avail = 9999

            if _ram_avail > 900:
                logger.info("[AGENT] route=full_model")
            else:
                logger.info("[AGENT] route=low_memory_fallback")
                yield {"type": "meta", "model": "fallback", "reason": "low-memory"}
                yield {"type": "token", "content": self._fallback_response(decision.task, full_messages)}
                yield {"type": "done"}
                return

            try:
                await self._ensure_loaded(decision)
            except ModelLoadError as exc:
                self._low_memory_mode = True
                logger.warning(f"[AGENT] all models failed to load: {exc}")
                logger.info("[AGENT] low_memory_mode=True")

                if settings.enable_cloud_fallback and self._cloud_key_available():
                    logger.info("[AGENT] route=cloud_fallback")
                    yield {"type": "meta", "model": "cloud", "reason": "model-load-failed"}
                    try:
                        response_text = ""
                        async for token in self._cloud_fallback_stream(full_messages):
                            response_text += token
                            yield {"type": "token", "content": token}
                        self.save_memory(
                            user_id,
                            messages + [{"role": "assistant", "content": response_text}],
                        )
                        yield {"type": "done"}
                        return
                    except Exception as cloud_exc:
                        logger.warning(f"[AGENT] cloud fallback failed: {cloud_exc}")

                elif settings.enable_cloud_fallback and not self._cloud_key_available():
                    logger.warning("[AGENT] cloud_enabled=true but key not set")
                    yield {"type": "meta", "model": "fallback", "reason": "cloud-key-missing"}
                    yield {
                        "type": "token",
                        "content": (
                            "Cloud fallback is enabled but no API key is configured.\n\n"
                            "Set one of these in your `backend/.env` file:\n"
                            "- `INTELLIYASH_HF_TOKEN=hf_...` (HuggingFace)\n"
                            "- `INTELLIYASH_OPENAI_API_KEY=sk-...` + "
                            "`INTELLIYASH_CLOUD_PROVIDER=openai` (OpenAI)"
                        ),
                    }
                    yield {"type": "done"}
                    return

                logger.info("[AGENT] route=low_memory_fallback")
                yield {"type": "meta", "model": "fallback", "reason": "low-memory-mode"}
                yield {"type": "token", "content": self._fallback_response(decision.task, full_messages)}
                yield {"type": "done"}
                return

            _route_label = (
                "code_model" if decision.task == "code"
                else "reasoning_model" if decision.task == "reasoning"
                else "chat_model"
            )
            logger.info(f"[AGENT] route={_route_label} model={decision.spec.id} task={decision.task}")

            yield {
                "type": "meta",
                "model": decision.spec.id,
                "model_display": decision.spec.display_name,
                "task": decision.task,
                "reason": decision.reason,
            }

            # Cap generation length for tiny models to avoid OOM / slow output.
            effective_max_tokens = settings.max_tokens
            if decision.spec.tier == "tiny":
                effective_max_tokens = min(effective_max_tokens, _TINY_MAX_TOKENS)

            # Reject prompts that would overflow the context window.
            n_ctx = settings.n_ctx
            estimated_input_tokens = _estimate_tokens(full_messages)
            if estimated_input_tokens + effective_max_tokens + _CTX_HEADROOM > n_ctx:
                logger.warning(
                    f"[AGENT] context overflow: ~{estimated_input_tokens} input tokens + "
                    f"{effective_max_tokens} max_tokens > ctx={n_ctx} — returning friendly message"
                )
                yield {
                    "type": "token",
                    "content": (
                        "Your conversation is getting long and would overflow this model's "
                        f"context window ({n_ctx} tokens). "
                        "Please start a new chat or ask a shorter question."
                    ),
                }
                yield {"type": "done"}
                return

            response_text = ""
            try:
                async for piece in manager.chat_stream(
                    full_messages,
                    max_tokens=effective_max_tokens,
                    temperature=settings.temperature,
                ):
                    response_text += piece
                    yield {"type": "token", "content": piece}
            except Exception:
                logger.exception("generation failed")
                if not response_text:
                    yield {"type": "token", "content": self._fallback_response(decision.task, full_messages)}
                yield {"type": "done"}
                return

            self.save_memory(
                user_id,
                messages + [{"role": "assistant", "content": response_text}],
            )
            yield {"type": "done"}

    async def _cloud_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        url = f"{settings.cloud_api_base.rstrip('/')}/v1/messages"

        headers = {
            "x-api-key": settings.cloud_api_key or "",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }

        body = {
            "model": settings.cloud_model,
            "max_tokens": settings.max_tokens,
            "stream": True,
            "messages": [
                {"role": m["role"], "content": m["content"]}
                for m in messages
                if m.get("role") in {"user", "assistant"}
            ],
        }

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    text = await resp.aread()
                    raise RuntimeError(f"cloud {resp.status_code}: {text.decode(errors='ignore')}")

                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue

                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue

                    try:
                        import json
                        evt = json.loads(payload)
                        delta = evt.get("delta", {}).get("text")
                        if delta:
                            yield delta
                    except Exception:
                        continue

    async def _openai_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        import json
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.openai_api_key or ''}",
            "Content-Type": "application/json",
        }
        body = {
            "model": settings.cloud_model,
            "stream": True,
            "messages": [
                {"role": m["role"], "content": m["content"]}
                for m in messages
                if m.get("role") in {"user", "assistant", "system"}
            ],
        }
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    text = await resp.aread()
                    raise RuntimeError(f"OpenAI {resp.status_code}: {text.decode(errors='ignore')}")
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        evt = json.loads(payload)
                        delta = (
                            evt.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content")
                        )
                        if delta:
                            yield delta
                    except Exception:
                        continue

    async def _hf_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        import json
        model = settings.hf_model or "Qwen/Qwen2.5-Coder-1.5B-Instruct"
        url = f"https://api-inference.huggingface.co/models/{model}/v1/chat/completions"

        headers: dict = {"Content-Type": "application/json"}
        if settings.hf_token:
            headers["Authorization"] = f"Bearer {settings.hf_token}"
            logger.info("[AGENT] route=hf_fallback (token)")
        else:
            logger.info("[AGENT] route=hf_fallback (no token)")

        body = {
            "model": model,
            "stream": True,
            "max_tokens": settings.max_tokens,
            "messages": [
                {"role": m["role"], "content": m["content"]}
                for m in messages
                if m.get("role") in {"user", "assistant", "system"}
            ],
        }

        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    text = await resp.aread()
                    raise RuntimeError(f"HuggingFace {resp.status_code}: {text.decode(errors='ignore')}")
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if not payload or payload == "[DONE]":
                        continue
                    try:
                        evt = json.loads(payload)
                        delta = (
                            evt.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content")
                        )
                        if delta:
                            yield delta
                    except Exception:
                        continue

    async def _gemini_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        """Google Gemini via google-generativeai SDK (optional dependency)."""
        try:
            import google.generativeai as genai  # type: ignore
        except ImportError:
            raise RuntimeError(
                "google-generativeai not installed. "
                "Run: pip install google-generativeai"
            )
        genai.configure(api_key=settings.gemini_api_key or "")
        model = genai.GenerativeModel(settings.gemini_model)

        # Convert message history to Gemini format
        history = []
        for m in messages[:-1]:
            role = "user" if m.get("role") == "user" else "model"
            history.append({"role": role, "parts": [m.get("content", "")]})
        last = messages[-1].get("content", "") if messages else ""

        chat = model.start_chat(history=history)
        response = chat.send_message(last, stream=True)
        for chunk in response:
            text = getattr(chunk, "text", None)
            if text:
                yield text

    async def _cloud_fallback_stream(self, messages: list[dict]) -> AsyncIterator[str]:
        provider = (settings.cloud_provider or "huggingface").lower()
        if provider == "huggingface":
            async for token in self._hf_stream(messages):
                yield token
        elif provider == "openai":
            async for token in self._openai_stream(messages):
                yield token
        elif provider == "gemini":
            async for token in self._gemini_stream(messages):
                yield token
        else:
            async for token in self._cloud_stream(messages):
                yield token


service = LLMService()
