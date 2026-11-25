from __future__ import annotations

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
import time
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator

from .config import Settings
from .database import Database
from .llm import AllProvidersUnavailable, LiteLLMService


class ChatRequest(BaseModel):
    session_id: Annotated[str, Field(min_length=1, max_length=128)]
    message: Annotated[str, Field(min_length=1, max_length=4000)]
    system_prompt: Annotated[str | None, Field(max_length=4000)] = None

    @field_validator("session_id", "message", mode="before")
    @classmethod
    def trim_required(cls, value: object) -> str:
        if not isinstance(value, str):
            return value  # type: ignore[return-value]
        value = value.strip()
        if not value:
            raise ValueError("must not be empty")
        return value


def parse_simulation(value: str | None, enabled: bool) -> dict[str, int]:
    if not value or not enabled:
        return {}
    allowed = {429, 500, 502, 503}
    parsed: dict[str, int] = {}
    for pair in value.split(","):
        key, separator, raw_status = pair.strip().partition("=")
        if not separator or (key != "*" and not (key.startswith("key_") and key[4:].isdigit())):
            raise HTTPException(status_code=422, detail="invalid X-Simulate-Failure header")
        try:
            status = int(raw_status)
        except ValueError as error:
            raise HTTPException(status_code=422, detail="invalid X-Simulate-Failure header") from error
        if status not in allowed:
            raise HTTPException(status_code=422, detail="invalid X-Simulate-Failure header")
        parsed[key] = status
    return parsed


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    database = Database(settings.database_url)
    locks: defaultdict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        database.initialize()
        app.state.database = database
        app.state.llm_service = LiteLLMService(settings)
        yield

    app = FastAPI(title="LYFTR AI Chat API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins) if "*" not in settings.allowed_origins else ["*"],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    @app.exception_handler(Exception)
    async def unexpected_error(_: Request, __: Exception) -> JSONResponse:
        return JSONResponse(status_code=500, content={"detail": "internal server error"})

    @app.get("/health")
    async def health() -> dict[str, object]:
        # A lightweight query proves the database connection rather than merely the file path.
        with database.connection() as connection:
            connection.execute("SELECT 1").fetchone()
        return {"status": "ok", "keys_configured": len(settings.llm_api_keys), "cache_enabled": True}

    @app.post("/chat")
    async def chat(
        payload: ChatRequest,
        x_simulate_failure: Annotated[str | None, Header()] = None,
    ) -> dict[str, object]:
        simulated = parse_simulation(x_simulate_failure, settings.enable_failure_simulation)
        async with locks[payload.session_id]:
            stored_session = database.session(payload.session_id)
            system_prompt = (
                payload.system_prompt
                if payload.system_prompt is not None
                else (stored_session["system_prompt"] if stored_session else settings.default_system_prompt)
            )
            history = database.messages(payload.session_id) if stored_session else []
            llm_messages = [{"role": "system", "content": system_prompt}, *history, {"role": "user", "content": payload.message}]
            started_at = time.perf_counter()
            try:
                completion = await app.state.llm_service.complete(llm_messages, simulated)
            except AllProvidersUnavailable as error:
                raise HTTPException(status_code=503, detail="all providers unavailable") from error
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            metadata: dict[str, object] = {
                "resolution_source": "LLM_CACHE" if completion.cache_hit else "LIVE_INFERENCE",
                "model": completion.model,
                "latency_ms": latency_ms,
                "input_tokens": completion.input_tokens,
                "output_tokens": completion.output_tokens,
                "key_id": completion.key_id,
                "fallback_attempts": completion.fallback_attempts,
            }
            database.save_exchange(payload.session_id, system_prompt, payload.message, completion.reply, metadata)
            return {"session_id": payload.session_id, "reply": completion.reply, "metadata": metadata}

    @app.get("/sessions/{session_id}/messages")
    async def session_messages(session_id: str) -> dict[str, object]:
        messages = database.public_messages(session_id)
        if messages is None:
            raise HTTPException(status_code=404, detail="session not found")
        return {"session_id": session_id, "messages": messages}

    return app


app = create_app()
