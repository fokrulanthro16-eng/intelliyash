#!/usr/bin/env bash
# IntelliYash one-shot installer for macOS / Linux.
# Just runs the cross-platform builder, but checks dependencies first
# so the failure messages are friendlier.

set -e

YELLOW='\033[33m'; GREEN='\033[32m'; RED='\033[31m'; NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $1"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $1"; }
err()  { echo -e "${RED}[err]${NC}   $1" >&2; }

cd "$(dirname "$0")"

log "Checking python3 …"
if ! command -v python3 >/dev/null 2>&1; then
  err "python3 is not installed. Install Python 3.10+ from https://python.org and rerun."
  exit 1
fi

PY_OK=$(python3 -c 'import sys;print(1 if sys.version_info>=(3,10) else 0)')
if [ "$PY_OK" != "1" ]; then
  err "Python 3.10+ required."
  exit 1
fi

log "Checking node …"
if ! command -v node >/dev/null 2>&1; then
  err "Node.js is not installed. Install Node 18+ from https://nodejs.org and rerun."
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node 18+ required (got v$NODE_MAJOR)."
  exit 1
fi

log "Checking npm …"
if ! command -v npm >/dev/null 2>&1; then
  err "npm not found (should ship with Node)."
  exit 1
fi

log "Handing off to intelliyash_builder.py …"
exec python3 intelliyash_builder.py "$@"
