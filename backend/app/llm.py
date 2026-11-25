from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Any

from .config import Settings


@dataclass(frozen=True)
class Completion:
    reply: str
    input_tokens: int
    output_tokens: int
    model: str
    cache_hit: bool
    key_id: str | None
    fallback_attempts: int


class AllProvidersUnavailable(Exception):
    pass


class LiteLLMService:
    """A small, explicit key pool around LiteLLM's native completion and cache APIs."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._configure_cache()

    def _configure_cache(self) -> None:
        os.makedirs(self.settings.cache_dir, exist_ok=True)
        import litellm
        from litellm import Cache

        # Disk is explicitly allowed by the brief and shares the Docker /data volume.
        litellm.cache = Cache(type="disk", disk_cache_dir=self.settings.cache_dir)
        litellm.enable_cache = True

    @staticmethod
    def _cache_hit(response: Any) -> bool:
        hidden = getattr(response, "_hidden_params", None) or getattr(response, "hidden_params", None) or {}
        if isinstance(hidden, dict) and hidden.get("cache_hit") is True:
            return True
        if isinstance(response, dict):
            return bool(response.get("cache_hit") or response.get("_hidden_params", {}).get("cache_hit"))
        return bool(getattr(response, "cache_hit", False))

    @staticmethod
    def _usage(response: Any) -> tuple[int, int]:
        usage = getattr(response, "usage", None) or (response.get("usage") if isinstance(response, dict) else None) or {}
        prompt = getattr(usage, "prompt_tokens", None) if not isinstance(usage, dict) else usage.get("prompt_tokens")
        completion = getattr(usage, "completion_tokens", None) if not isinstance(usage, dict) else usage.get("completion_tokens")
        return int(prompt or 0), int(completion or 0)

    @staticmethod
    def _reply(response: Any) -> str:
        choices = getattr(response, "choices", None) or (response.get("choices") if isinstance(response, dict) else [])
        content = getattr(choices[0].message, "content", None) if choices else None
        if content is None and choices and isinstance(choices[0], dict):
            content = choices[0].get("message", {}).get("content")
        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("provider returned an empty response")
        return content

    @staticmethod
    def _retryable(error: Exception) -> bool:
        status = getattr(error, "status_code", None) or getattr(error, "status", None)
        if status == 429 or (isinstance(status, int) and 500 <= status <= 599):
            return True
        message = str(error).lower()
        return "quota" in message or "rate limit" in message or "rate_limit" in message

    async def complete(self, messages: list[dict[str, str]], simulated_failures: dict[str, int]) -> Completion:
        from litellm import acompletion

        failures = 0
        bypass_cache = bool(simulated_failures)
        for index, key in enumerate(self.settings.llm_api_keys, start=1):
            key_id = f"key_{index}"
            if key_id in simulated_failures or "*" in simulated_failures:
                failures += 1
                continue
            try:
                response = await acompletion(
                    model=self.settings.llm_model,
                    messages=messages,
                    api_key=key,
                    caching=not bypass_cache,
                )
                cache_hit = self._cache_hit(response)
                input_tokens, output_tokens = self._usage(response)
                return Completion(
                    reply=self._reply(response),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    model=self.settings.llm_model,
                    cache_hit=cache_hit,
                    key_id=None if cache_hit else key_id,
                    fallback_attempts=0 if cache_hit else failures,
                )
            except Exception as error:
                if not self._retryable(error):
                    raise
                failures += 1
        raise AllProvidersUnavailable()
