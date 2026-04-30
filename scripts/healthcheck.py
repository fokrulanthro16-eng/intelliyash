"""Tiny standalone healthcheck. Exit 0 if backend is up, 1 otherwise.

Use from systemd, Docker HEALTHCHECK, or a cron job.
"""
from __future__ import annotations

import sys
import urllib.request


def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/api/health/ping"
    try:
        with urllib.request.urlopen(url, timeout=5) as r:
            return 0 if r.status == 200 else 1
    except Exception:
        return 1


if __name__ == "__main__":
    sys.exit(main())
