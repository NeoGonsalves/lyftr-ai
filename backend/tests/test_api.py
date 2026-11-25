from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.llm import AllProvidersUnavailable, Completion
from app.main import create_app


class FakeLLM:
    def __init__(self) -> None:
        self.cache: dict[str, Completion] = {}

    async def complete(self, messages, simulated_failures):
        if "*" in simulated_failures:
            raise AllProvidersUnavailable()
        failures = 1 if "key_1" in simulated_failures else 0
        cache_key = repr(messages)
        if not simulated_failures and cache_key in self.cache:
            cached = self.cache[cache_key]
            return Completion(cached.reply, cached.input_tokens, cached.output_tokens, cached.model, True, None, 0)
        user_message = messages[-1]["content"]
        result = Completion(
            reply=f"Answer: {user_message}",
            input_tokens=len(messages) * 10,
            output_tokens=3,
            model="gemini/gemini-3.8-flash",
            cache_hit=False,
            key_id="key_2" if failures else "key_1",
            fallback_attempts=failures,
        )
        if not simulated_failures:
            self.cache[cache_key] = result
        return result


def make_client(tmp_path: Path) -> TestClient:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'app.db'}",
        llm_api_keys=("one", "two"),
        llm_model="gemini/gemini-3.8-flash",
        allowed_origins=("http://localhost:3000",),
        enable_failure_simulation=True,
        default_system_prompt="You are helpful.",
        cache_dir=str(tmp_path / "cache"),
    )
    app = create_app(settings)
    client = TestClient(app)
    client.__enter__()
    client.app.state.llm_service = FakeLLM()
    return client


def close(client: TestClient) -> None:
    client.__exit__(None, None, None)


def test_health_and_validation(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    try:
        assert client.get("/health").json() == {"status": "ok", "keys_configured": 2, "cache_enabled": True}
        assert client.post("/chat", json={"session_id": "s", "message": "   "}).status_code == 422
        assert client.post("/chat", json={"session_id": "", "message": "hello"}).status_code == 422
        assert client.post("/chat", json={"session_id": "s", "message": "x" * 4001}).status_code == 422
    finally:
        close(client)


def test_history_metadata_and_separate_sessions(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    try:
        first = client.post("/chat", json={"session_id": "s-one", "message": "First", "system_prompt": "Be concise"})
        assert first.status_code == 200
        assert first.json()["metadata"]["resolution_source"] == "LIVE_INFERENCE"
        second = client.post("/chat", json={"session_id": "s-one", "message": "Second"})
        assert second.json()["metadata"]["input_tokens"] == 40
        history = client.get("/sessions/s-one/messages").json()
        assert [item["role"] for item in history["messages"]] == ["user", "assistant", "user", "assistant"]
        assert "system_prompt" not in str(history)
        assert client.get("/sessions/unknown/messages").status_code == 404
    finally:
        close(client)


def test_cache_and_failure_hook_do_not_corrupt_history(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    try:
        first = client.post("/chat", json={"session_id": "first", "message": "Same"}).json()
        cached = client.post("/chat", json={"session_id": "second", "message": "Same"}).json()
        assert first["reply"] == cached["reply"]
        assert cached["metadata"]["resolution_source"] == "LLM_CACHE"
        assert cached["metadata"]["key_id"] is None
        failover = client.post("/chat", json={"session_id": "third", "message": "New"}, headers={"X-Simulate-Failure": "key_1=429"})
        assert failover.status_code == 200
        assert failover.json()["metadata"]["key_id"] == "key_2"
        assert failover.json()["metadata"]["fallback_attempts"] == 1
        unavailable = client.post("/chat", json={"session_id": "broken", "message": "Nope"}, headers={"X-Simulate-Failure": "*=429"})
        assert unavailable.status_code == 503
        assert unavailable.json() == {"detail": "all providers unavailable"}
        assert client.get("/sessions/broken/messages").status_code == 404
    finally:
        close(client)
