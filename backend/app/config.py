"""Application configuration. All values overridable via env vars or .env file."""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
MODELS_DIR = PROJECT_ROOT / "app" / "models_storage"
DATA_DIR.mkdir(parents=True, exist_ok=True)
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Force env files into os.environ BEFORE Settings() reads them.
# .env.local is loaded first (lower priority); .env overrides it.
# Missing files are silently skipped by load_dotenv.
load_dotenv(PROJECT_ROOT / ".env.local", override=False)
load_dotenv(PROJECT_ROOT / ".env", override=True)

# Temporary startup debug — safe, never prints key values.
print(
    "[DEBUG ENV] INTELLIYASH_ENABLE_CLOUD_FALLBACK =",
    os.getenv("INTELLIYASH_ENABLE_CLOUD_FALLBACK", "<not set>"),
)


class Settings(BaseSettings):
    """Runtime settings.

    Override any of these by exporting env vars or putting a .env in backend/.
    """

    model_config = SettingsConfigDict(
        # .env.local loaded first, .env second — .env wins on conflicts.
        # Missing files are silently skipped by pydantic-settings.
        env_file=(
            str(PROJECT_ROOT / ".env.local"),
            str(PROJECT_ROOT / ".env"),
        ),
        env_file_encoding="utf-8",
        env_prefix="INTELLIYASH_",
        extra="ignore",
    )

    # Server
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Paths
    data_dir: Path = DATA_DIR
    models_dir: Path = MODELS_DIR
    db_path: Path = DATA_DIR / "intelliyash.sqlite3"
    chroma_path: Path = DATA_DIR / "chroma"

    # Inference defaults — these get overridden by SystemDetector at boot.
    n_threads: int | None = None        # auto from CPU count
    n_ctx: int = 2048                   # context window
    max_tokens: int = 512               # generation cap
    temperature: float = 0.7

    # Optimizer
    idle_unload_seconds: int = 300      # unload model after 5 min idle
    ram_safety_margin_mb: int = 300     # leave at least 300 MB free

    # Cloud/remote fallback (off by default)
    # Set INTELLIYASH_ENABLE_CLOUD_FALLBACK=true to enable.
    # Providers:
    #   huggingface → INTELLIYASH_HF_TOKEN + INTELLIYASH_HF_MODEL
    #   openai      → INTELLIYASH_OPENAI_API_KEY + INTELLIYASH_CLOUD_PROVIDER=openai
    #   anthropic   → INTELLIYASH_CLOUD_API_KEY  + INTELLIYASH_CLOUD_PROVIDER=anthropic
    enable_cloud_fallback: bool = True
    cloud_provider: str = "huggingface"       # huggingface | openai | anthropic
    hf_token: str | None = None               # Hugging Face access token
    hf_model: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
    cloud_api_key: str | None = None          # Anthropic key (legacy)
    openai_api_key: str | None = None         # OpenAI key
    cloud_api_base: str = "https://api.anthropic.com"
    cloud_model: str = "claude-haiku-4-5-20251001"

    # Gemini (optional)
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"


settings = Settings()
