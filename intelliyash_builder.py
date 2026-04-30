"""IntelliYash builder.

A single Python script that:
    1. validates the host (Python/Node versions)
    2. creates a Python venv for the backend and installs requirements
    3. runs `npm install` for the frontend
    4. starts the backend on :8000 and the frontend on :3000
    5. opens the browser

Run:
    python intelliyash_builder.py            # full setup + run
    python intelliyash_builder.py --setup    # setup only, don't launch
    python intelliyash_builder.py --run      # launch only, assume installed
"""
from __future__ import annotations

import argparse
import os
import platform
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path


ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"

IS_WINDOWS = platform.system() == "Windows"


def log(msg: str, kind: str = "info") -> None:
    colors = {
        "info": "\033[36m",
        "ok": "\033[32m",
        "warn": "\033[33m",
        "err": "\033[31m",
    }
    reset = "\033[0m"
    if IS_WINDOWS:
        print(f"[{kind.upper()}] {msg}")
    else:
        print(f"{colors.get(kind, '')}[{kind.upper()}]{reset} {msg}")


def run(cmd, cwd=None, check=True, env=None):
    log(f"$ {' '.join(cmd) if isinstance(cmd, list) else cmd}")
    return subprocess.run(cmd, cwd=cwd, check=check, env=env, shell=isinstance(cmd, str))


def venv_python() -> Path:
    return VENV / ("Scripts" if IS_WINDOWS else "bin") / ("python.exe" if IS_WINDOWS else "python")


def venv_pip() -> Path:
    return VENV / ("Scripts" if IS_WINDOWS else "bin") / ("pip.exe" if IS_WINDOWS else "pip")


# ---------------------------------------------------------------- validate ---
def validate_environment() -> None:
    log("Checking Python …")
    if sys.version_info < (3, 10):
        log(f"Python 3.10+ required, found {sys.version}", "err")
        sys.exit(1)

    log("Checking Node …")
    if shutil.which("node") is None:
        log("Node.js not found. Install Node 18+ from https://nodejs.org", "err")
        sys.exit(1)
    try:
        out = subprocess.check_output(["node", "--version"], text=True).strip()
        major = int(out.lstrip("v").split(".")[0])
        if major < 18:
            log(f"Node 18+ required, found {out}", "err")
            sys.exit(1)
        log(f"Node {out} OK", "ok")
    except Exception as e:
        log(f"Could not check Node version: {e}", "warn")

    log(f"Python {sys.version.split()[0]} OK", "ok")


# --------------------------------------------------------------- setup -------
def setup_backend() -> None:
    log("Creating Python virtualenv …")
    if not VENV.exists():
        run([sys.executable, "-m", "venv", str(VENV)])
    else:
        log("venv already exists, reusing", "ok")

    log("Upgrading pip …")
    run([str(venv_python()), "-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"])

    log("Installing backend requirements (this may take several minutes the first time) …")
    run([str(venv_pip()), "install", "-r", str(BACKEND / "requirements.txt")])
    log("Backend ready", "ok")


def setup_frontend() -> None:
    log("Installing frontend dependencies …")
    if not (FRONTEND / "node_modules").exists():
        run(["npm", "install", "--no-audit", "--no-fund"], cwd=str(FRONTEND))
    else:
        log("node_modules exists, skipping install", "ok")
    log("Frontend ready", "ok")


# --------------------------------------------------------------- launch ------
class ProcRunner:
    """Run a process and stream its stdout/stderr to ours, prefixed."""

    def __init__(self, name: str, cmd, cwd, env=None):
        self.name = name
        self.cmd = cmd
        self.cwd = cwd
        self.env = env
        self.proc: subprocess.Popen | None = None

    def start(self) -> None:
        log(f"Starting {self.name} …", "ok")
        self.proc = subprocess.Popen(
            self.cmd,
            cwd=self.cwd,
            env=self.env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )
        threading.Thread(target=self._pump, daemon=True).start()

    def _pump(self) -> None:
        assert self.proc and self.proc.stdout
        for line in self.proc.stdout:
            print(f"[{self.name}] {line.rstrip()}")

    def stop(self) -> None:
        if not self.proc:
            return
        log(f"Stopping {self.name} …")
        try:
            if IS_WINDOWS:
                self.proc.terminate()
            else:
                self.proc.send_signal(signal.SIGINT)
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()


def launch() -> None:
    backend_cmd = [str(venv_python()), "run.py"]
    frontend_cmd = ["npm", "run", "dev"]

    backend = ProcRunner("backend", backend_cmd, cwd=str(BACKEND))
    frontend = ProcRunner("frontend", frontend_cmd, cwd=str(FRONTEND))

    backend.start()
    # give backend a head start so its CORS is ready when the UI loads
    time.sleep(2)
    frontend.start()

    # Wait for the frontend port and open browser
    def _open():
        time.sleep(6)
        try:
            webbrowser.open("http://localhost:3000")
        except Exception:
            pass

    threading.Thread(target=_open, daemon=True).start()

    log("IntelliYash is running. Press Ctrl+C to stop.", "ok")
    log("  Backend  → http://localhost:8000/docs")
    log("  Frontend → http://localhost:3000")

    try:
        while True:
            time.sleep(1)
            if backend.proc and backend.proc.poll() is not None:
                log("Backend exited.", "err")
                break
            if frontend.proc and frontend.proc.poll() is not None:
                log("Frontend exited.", "err")
                break
    except KeyboardInterrupt:
        log("Shutting down …")
    finally:
        frontend.stop()
        backend.stop()


# --------------------------------------------------------------- main --------
def main() -> None:
    parser = argparse.ArgumentParser(description="IntelliYash builder")
    parser.add_argument("--setup", action="store_true", help="setup only")
    parser.add_argument("--run", action="store_true", help="launch only")
    args = parser.parse_args()

    log("IntelliYash builder starting", "ok")
    log(f"Project root: {ROOT}")

    if not args.run:
        validate_environment()
        setup_backend()
        setup_frontend()
        if args.setup:
            log("Setup complete. Run again without --setup to launch.", "ok")
            return

    launch()


if __name__ == "__main__":
    main()
