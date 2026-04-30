from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseSettings


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "app" / "models_storage"

DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

load_dotenv(PROJECT_ROOT / ".env.local", override=False)
load_dotenv(PROJECT_ROOT / ".env", override=True)


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = int(os.getenv("PORT", "8000"))
    cors_origins: list[str] = ["*"]

    data_dir: Path = DATA_DIR
    models_dir: Path = MODELS_DIR
    db_path: Path = DATA_DIR / "intelliyash.sqlite3"

    n_ctx: int = 2048
    max_tokens: int = 512
    temperature: float = 0.7

    idle_unload_seconds: int = 300

    enable_cloud_fallback: bool = False


settings = Settings()