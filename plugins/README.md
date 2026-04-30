# IntelliYash Plugin System

Plugins let you extend IntelliYash without modifying core files. The plugin system is intentionally minimal: plugins are Python modules that register handler functions for named lifecycle hooks. No arbitrary code execution, no network calls at install time.

---

## Directory layout

```
plugins/
  registry.json          ← list of installed plugins (edit to add/disable)
  registry.schema.json   ← JSON Schema for registry.json
  README.md              ← this file
  <plugin-id>/
    __init__.py          ← plugin entry point
    ...
```

---

## How plugins work

1. On startup, the backend reads `plugins/registry.json`.
2. For each enabled plugin, it imports the module at the `entry` path.
3. The module must expose a `register(hooks)` function that attaches callables to lifecycle hooks.
4. At runtime, core calls the registered handlers at each hook point.

### Available hooks

| Hook | When called | Payload |
|---|---|---|
| `on_chat_message` | Before a user message is processed | `{"messages": [...]}` |
| `on_chat_response` | After each streamed response completes | `{"content": str, "model": str}` |
| `on_project_generated` | After a project is written to disk | `{"name": str, "path": str}` |
| `on_model_loaded` | After a model is loaded into memory | `{"model_id": str}` |
| `on_model_unloaded` | After a model is unloaded | `{"model_id": str}` |

Hooks are **fire-and-forget** — they cannot modify the request or block the response. This is intentional: plugins are for side-effects (logging, notifications, analytics) not request interception.

---

## Writing a plugin

Create a folder under `plugins/` and add `__init__.py`:

```python
# plugins/my-org/hello-world/__init__.py

def register(hooks):
    hooks.on("on_chat_response", handle_response)
    hooks.on("on_project_generated", handle_project)

def handle_response(payload):
    print(f"[hello-world] response finished, model={payload['model']}")

def handle_project(payload):
    print(f"[hello-world] project generated: {payload['name']} at {payload['path']}")
```

Then add it to `registry.json`:

```json
{
  "version": "1",
  "plugins": [
    {
      "id": "my-org/hello-world",
      "name": "Hello World Plugin",
      "version": "0.1.0",
      "description": "Prints hook events to stdout.",
      "author": "Your Name",
      "entry": "plugins/my-org/hello-world/__init__.py",
      "enabled": true,
      "hooks": ["on_chat_response", "on_project_generated"],
      "config": {}
    }
  ]
}
```

Restart the backend to load the new plugin.

---

## Security model

- Plugins run in the same process as the backend with the same permissions.
- **Do not install plugins from untrusted sources.**
- Plugin code is loaded via standard Python `importlib` — no sandboxing.
- The registry schema enforces the allowed hook names; unknown hooks are ignored.
- API keys and model weights are never passed to hook payloads.

---

## Disabling a plugin

Set `"enabled": false` in `registry.json` and restart. The module is not imported.

---

## Future roadmap

- Hook return values for request modification (opt-in, explicit)
- Frontend plugin slots (UI extensions via iframes or JSON widgets)
- Plugin marketplace / one-click install from a trusted registry URL
- Sandboxed execution via subprocess with IPC

These features are **not yet implemented**. The current system is a foundation.
