"""IntelliYash deploy.py — push to GitHub, deploy backend (Render), frontend (Vercel).

Honest scope:
    * "git push" requires a remote and credentials configured locally.
    * Render and Vercel deploys require API tokens and a (one-time)
      service/project to be created in their UIs first.
    * Once those are set up, this script automates updates on every run.

What this script does:
    1. Validates required env vars.
    2. Commits and pushes the current tree to the configured GitHub remote.
    3. Triggers a Render deploy hook for the backend.
    4. Triggers a Vercel deploy hook for the frontend.
    5. Prints the resulting URLs.

Required environment variables (override on the command line if you want):
    GITHUB_REMOTE          e.g. git@github.com:you/intelliyash.git  (optional if origin is set)
    GITHUB_BRANCH          defaults to "main"
    RENDER_DEPLOY_HOOK     full URL from Render dashboard (Service → Settings → Deploy Hook)
    VERCEL_DEPLOY_HOOK     full URL from Vercel dashboard (Project → Settings → Git → Deploy Hooks)
    BACKEND_PUBLIC_URL     printed at the end (e.g. https://intelliyash.onrender.com)
    FRONTEND_PUBLIC_URL    printed at the end (e.g. https://intelliyash.vercel.app)

Usage:
    python deploy.py
    python deploy.py --skip-push
    python deploy.py --message "fix: routing bug"
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import urllib.request
import urllib.error


ROOT = Path(__file__).resolve().parent


def log(msg: str, kind: str = "info") -> None:
    prefix = {"info": "[deploy]", "ok": "[ ok ]", "err": "[err ]", "warn": "[warn]"}[kind]
    print(f"{prefix} {msg}")


def run(cmd, cwd=None, check=True, capture=False):
    log(f"$ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    result = subprocess.run(
        cmd,
        cwd=cwd,
        check=check,
        text=True,
        capture_output=capture,
        shell=isinstance(cmd, str),
    )
    return result


def ensure_git_repo() -> None:
    if not (ROOT / ".git").exists():
        log("Initializing git repository …")
        run(["git", "init"], cwd=str(ROOT))
        run(["git", "branch", "-M", os.environ.get("GITHUB_BRANCH", "main")], cwd=str(ROOT))


def ensure_remote() -> None:
    remote = os.environ.get("GITHUB_REMOTE")
    if not remote:
        # Already configured?
        try:
            run(["git", "remote", "get-url", "origin"], cwd=str(ROOT), capture=True)
            return
        except subprocess.CalledProcessError:
            log(
                "GITHUB_REMOTE not set and no `origin` remote configured. "
                "Set GITHUB_REMOTE=git@github.com:you/intelliyash.git or run "
                "`git remote add origin …` manually.",
                "err",
            )
            sys.exit(1)
    try:
        run(["git", "remote", "remove", "origin"], cwd=str(ROOT), check=False, capture=True)
    except Exception:
        pass
    run(["git", "remote", "add", "origin", remote], cwd=str(ROOT))


def commit_and_push(message: str, branch: str) -> None:
    run(["git", "add", "-A"], cwd=str(ROOT))
    # Allow empty commits to make a deploy-only push possible.
    res = run(
        ["git", "commit", "-m", message, "--allow-empty"],
        cwd=str(ROOT),
        check=False,
        capture=True,
    )
    if res.returncode != 0 and "nothing to commit" not in (res.stdout + res.stderr):
        log(res.stdout)
        log(res.stderr, "err")
        sys.exit(1)
    run(["git", "push", "-u", "origin", branch], cwd=str(ROOT))


def trigger_hook(name: str, env_var: str) -> bool:
    url = os.environ.get(env_var)
    if not url:
        log(f"{env_var} not set — skipping {name} deploy.", "warn")
        return False
    log(f"Triggering {name} deploy hook …")
    req = urllib.request.Request(url, method="POST", data=b"")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            log(f"{name}: HTTP {resp.status} — {body[:200]}", "ok")
            return True
    except urllib.error.HTTPError as e:
        log(f"{name} hook failed: HTTP {e.code} {e.reason}", "err")
        return False
    except Exception as e:
        log(f"{name} hook failed: {e}", "err")
        return False


def write_render_yaml() -> None:
    """Write a render.yaml so the backend can be created from the dashboard
    in one click. Idempotent."""
    path = ROOT / "render.yaml"
    if path.exists():
        return
    path.write_text(
        """services:
  - type: web
    name: intelliyash-backend
    env: python
    plan: free
    rootDir: backend
    buildCommand: pip install --upgrade pip && pip install -r requirements.txt
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT
    envVars:
      - key: PYTHON_VERSION
        value: 3.11.9
      - key: INTELLIYASH_HOST
        value: 0.0.0.0
"""
    )
    log("Wrote render.yaml", "ok")


def write_vercel_json() -> None:
    """Frontend Vercel config — sets root and rewrites /api/* to backend."""
    path = ROOT / "frontend" / "vercel.json"
    if path.exists():
        return
    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "https://intelliyash-backend.onrender.com")
    path.write_text(
        f"""{{
  "framework": "nextjs",
  "buildCommand": "next build",
  "rewrites": [
    {{ "source": "/api/:path*", "destination": "{backend_url}/api/:path*" }}
  ]
}}
"""
    )
    log("Wrote frontend/vercel.json", "ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-push", action="store_true")
    parser.add_argument("--skip-render", action="store_true")
    parser.add_argument("--skip-vercel", action="store_true")
    parser.add_argument("--message", default=f"deploy: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    args = parser.parse_args()

    log("IntelliYash deploy starting", "ok")

    write_render_yaml()
    write_vercel_json()

    branch = os.environ.get("GITHUB_BRANCH", "main")

    if not args.skip_push:
        ensure_git_repo()
        ensure_remote()
        commit_and_push(args.message, branch)

    if not args.skip_render:
        trigger_hook("Render (backend)", "RENDER_DEPLOY_HOOK")

    if not args.skip_vercel:
        trigger_hook("Vercel (frontend)", "VERCEL_DEPLOY_HOOK")

    backend_url = os.environ.get("BACKEND_PUBLIC_URL", "(set BACKEND_PUBLIC_URL to print)")
    frontend_url = os.environ.get("FRONTEND_PUBLIC_URL", "(set FRONTEND_PUBLIC_URL to print)")

    print()
    log("Deploy complete.", "ok")
    log(f"  Backend  → {backend_url}")
    log(f"  Frontend → {frontend_url}")


if __name__ == "__main__":
    main()
