from __future__ import annotations

from dataclasses import dataclass
import os

from dotenv import load_dotenv

load_dotenv()


def _csv(name: str, default: str = "") -> tuple[str, ...]:
    return tuple(value.strip() for value in os.getenv(name, default).split(",") if value.strip())


@dataclass(frozen=True)
class Settings:
    database_url: str
    llm_api_keys: tuple[str, ...]
    llm_model: str
    allowed_origins: tuple[str, ...]
    enable_failure_simulation: bool
    default_system_prompt: str
    cache_dir: str

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            database_url=os.getenv("DATABASE_URL", "sqlite:////data/app.db"),
            llm_api_keys=_csv("LLM_API_KEYS"),
            llm_model=os.getenv("LLM_MODEL", "groq/openai/gpt-oss-120b"),
            allowed_origins=_csv("ALLOWED_ORIGINS", "*"),
            enable_failure_simulation=os.getenv("ENABLE_FAILURE_SIMULATION", "false").lower() == "true",
            default_system_prompt=os.getenv("DEFAULT_SYSTEM_PROMPT", "You are a helpful assistant."),
            cache_dir=(
                os.getenv("LITELLM_CACHE_DIR", "/data/litellm-cache").removeprefix("/")
                if os.name == "nt" and os.getenv("LITELLM_CACHE_DIR", "").startswith("/data/")
                else os.getenv("LITELLM_CACHE_DIR", "/data/litellm-cache")
            ),
        )
