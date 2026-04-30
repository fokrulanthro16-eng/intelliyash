"""End-to-end smoke test for IntelliYash.

Tests that don't require a model load (always run):
    1. Backend root and /docs respond
    2. /api/health/ping
    3. /api/health
    4. /api/system returns a SystemProfile with a valid tier
    5. /api/models lists the registry
    6. /api/settings round-trips a setting
    7. Frontend (port 3000) serves something with "IntelliYash" in it

Tests that exercise the LLM (skipped by default — pass --inference):
    8. /api/chat/stream completes a tiny prompt and produces tokens

Usage:
    python test_system.py
    python test_system.py --backend http://127.0.0.1:8000
    python test_system.py --inference        # also test real generation
    python test_system.py --no-frontend      # backend-only
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
import urllib.error


PASS = 0
FAIL = 0
RESULTS: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  \033[32m✓\033[0m {name}" + (f" — {detail}" if detail else ""))
    else:
        FAIL += 1
        print(f"  \033[31m✗\033[0m {name}" + (f" — {detail}" if detail else ""))
    RESULTS.append((name, ok, detail))


def http_get(url: str, timeout: float = 5.0):
    req = urllib.request.Request(url)
    return urllib.request.urlopen(req, timeout=timeout)


def http_json(url: str, timeout: float = 10.0):
    with http_get(url, timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def http_post_json(url: str, body: dict, timeout: float = 30.0):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def http_post_stream(url: str, body: dict, timeout: float = 600.0):
    """Yield (event, data_dict) tuples for SSE."""
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    resp = urllib.request.urlopen(req, timeout=timeout)
    current_event = "message"
    for raw in resp:
        line = raw.decode("utf-8", errors="ignore").rstrip("\r\n")
        if line == "":
            current_event = "message"
            continue
        if line.startswith("event:"):
            current_event = line[6:].strip()
        elif line.startswith("data:"):
            payload = line[5:].strip()
            try:
                yield current_event, json.loads(payload)
            except Exception:
                yield current_event, {"_raw": payload}


# ----- tests ----------------------------------------------------------------
def test_backend_root(base: str) -> None:
    print("\nBackend basics")
    try:
        with http_get(f"{base}/") as r:
            data = json.loads(r.read().decode("utf-8"))
            check("GET /", r.status == 200 and data.get("name") == "IntelliYash",
                  f"name={data.get('name')}")
    except Exception as e:
        check("GET /", False, str(e))

    try:
        with http_get(f"{base}/docs") as r:
            check("GET /docs", r.status == 200, f"status={r.status}")
    except Exception as e:
        check("GET /docs", False, str(e))


def test_health(base: str) -> None:
    print("\nHealth")
    try:
        status, data = http_json(f"{base}/api/health/ping")
        check("GET /api/health/ping", status == 200 and data.get("ok") is True)
    except Exception as e:
        check("GET /api/health/ping", False, str(e))

    try:
        status, data = http_json(f"{base}/api/health")
        ok = (
            status == 200
            and data.get("status") == "ok"
            and isinstance(data.get("ram_total_mb"), int)
        )
        check("GET /api/health", ok, f"ram_total={data.get('ram_total_mb')}MB")
    except Exception as e:
        check("GET /api/health", False, str(e))


def test_system(base: str) -> None:
    print("\nSystem detection")
    try:
        status, data = http_json(f"{base}/api/system")
        valid_tier = data.get("tier") in {"tiny", "mini", "medium", "large"}
        ok = (
            status == 200
            and valid_tier
            and isinstance(data.get("recommended_threads"), int)
            and data["recommended_threads"] >= 2
        )
        check(
            "GET /api/system",
            ok,
            f"tier={data.get('tier')} threads={data.get('recommended_threads')} "
            f"ctx={data.get('recommended_ctx')}",
        )
    except Exception as e:
        check("GET /api/system", False, str(e))


def test_models(base: str) -> None:
    print("\nModel registry")
    try:
        status, data = http_json(f"{base}/api/models")
        models = data.get("models", [])
        ok = (
            status == 200
            and isinstance(models, list)
            and len(models) >= 4
            and all(m.get("id") and m.get("tier") for m in models)
        )
        check("GET /api/models", ok, f"{len(models)} models registered")
    except Exception as e:
        check("GET /api/models", False, str(e))


def test_settings_roundtrip(base: str) -> None:
    print("\nSettings round-trip")
    try:
        status, data = http_json(f"{base}/api/settings")
        check("GET /api/settings", status == 200, f"max_tokens={data.get('max_tokens')}")
        # Bump max_tokens by 1 and read back.
        original = int(data.get("max_tokens", 512))
        new_val = 256 if original != 256 else 384
        status, updated = http_post_json(
            f"{base}/api/settings", {"max_tokens": new_val}
        )
        check(
            "POST /api/settings",
            status == 200 and int(updated.get("max_tokens")) == new_val,
            f"updated to {updated.get('max_tokens')}",
        )
        # Restore
        http_post_json(f"{base}/api/settings", {"max_tokens": original})
    except Exception as e:
        check("settings round-trip", False, str(e))


def test_frontend(frontend: str) -> None:
    print("\nFrontend")
    try:
        with http_get(frontend, timeout=5.0) as r:
            html = r.read().decode("utf-8", errors="ignore")
            ok = r.status == 200 and "IntelliYash" in html
            check(f"GET {frontend}", ok, "found 'IntelliYash' in HTML" if ok else f"status={r.status}")
    except Exception as e:
        check(f"GET {frontend}", False, str(e))


def test_inference(base: str) -> None:
    print("\nInference (real model load — this can take a while on first run)")
    body = {
        "messages": [{"role": "user", "content": "Say only the word: hello"}],
        "force_task": "chat",
        "persist": False,
    }
    started = time.time()
    saw_meta = False
    saw_tokens = False
    saw_done = False
    error: str | None = None
    try:
        for event, data in http_post_stream(f"{base}/api/chat/stream", body, timeout=900):
            if event == "meta":
                saw_meta = True
            elif event == "token":
                saw_tokens = True
            elif event == "error":
                error = data.get("error", "(unknown)")
                break
            elif event == "done":
                saw_done = True
                break
    except Exception as e:
        error = str(e)

    elapsed = time.time() - started
    detail = f"meta={saw_meta} tokens={saw_tokens} done={saw_done} {elapsed:.1f}s"
    if error:
        detail += f" err={error}"
    check("POST /api/chat/stream", saw_meta and saw_tokens and saw_done, detail)


# ----- main -----------------------------------------------------------------
def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--backend", default="http://127.0.0.1:8000")
    p.add_argument("--frontend", default="http://127.0.0.1:3000")
    p.add_argument("--no-frontend", action="store_true")
    p.add_argument("--inference", action="store_true",
                   help="also test real model generation (slow on first run)")
    args = p.parse_args()

    print("=" * 60)
    print("IntelliYash test suite")
    print(f"  backend:  {args.backend}")
    if not args.no_frontend:
        print(f"  frontend: {args.frontend}")
    print("=" * 60)

    test_backend_root(args.backend)
    test_health(args.backend)
    test_system(args.backend)
    test_models(args.backend)
    test_settings_roundtrip(args.backend)
    if not args.no_frontend:
        test_frontend(args.frontend)
    if args.inference:
        test_inference(args.backend)

    print()
    print("=" * 60)
    print(f"  PASS: {PASS}    FAIL: {FAIL}")
    print("=" * 60)
    return 0 if FAIL == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
