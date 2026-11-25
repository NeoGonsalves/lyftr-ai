# LYFTR AI — Resilient LLM Chatbot

## 1. Live URLs

Not deployed by this repository. Before submitting, add the public URLs here:

- Frontend: `https://<your-frontend-url>`
- Backend: `https://<your-backend-url>`

## 2. Run locally: with Docker and without

### Docker

1. Copy `.env.example` to `.env` and set `LLM_API_KEYS` to at least two valid keys for `LLM_MODEL`.
2. Run `make up`.
3. Open `http://localhost:3000`. The API is at `http://localhost:8000`.
4. Stop the stack with `make down`.

The named `app_data` Docker volume owns `/data/app.db` and `/data/litellm-cache`, so SQLite history and the disk cache survive container restarts.

### Without Docker

Backend (Python 3.12 recommended):

```bash
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
source .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
export DATABASE_URL=sqlite:///./app.db
export LLM_API_KEYS=key-one,key-two
export LLM_MODEL=gemini/gemini-3.8-flash
export ALLOWED_ORIGINS=http://localhost:3000
export ENABLE_FAILURE_SIMULATION=true
uvicorn app.main:app --reload --port 8000
```

Frontend (Node 22 recommended):

```bash
cd frontend
npm install
# Windows PowerShell: $env:VITE_API_BASE_URL='http://localhost:8000'
export VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Run backend tests with `cd backend && pytest`.

## 3. Design decisions: key fallback, caching, SQLite session storage

Each request builds the full LLM message list from the stored session system prompt, ordered SQLite history, and the newly supplied user message. The client sends only that new message.

LiteLLM is called with an explicit ordered pool built from `LLM_API_KEYS`. A `429`, quota error, or `5xx` advances to the next key; an answer is never fabricated. When every key is unavailable, the API returns `503 {"detail":"all providers unavailable"}`. Public metadata uses `key_1`, `key_2`, and so on; it never exposes a secret.

LiteLLM's built-in disk cache is enabled under `/data/litellm-cache`. Its exact-match request key includes the configured model and complete message list, so identical first messages in fresh sessions share a cache entry while changed conversation context does not. Cache replies retain LiteLLM's stored input/output usage, have `key_id: null`, and are labelled `LLM_CACHE`.

SQLite is the only application store. The required `messages` table stores user and assistant turns, while a small `sessions` table stores the system prompt without returning it from the history API. A user/assistant exchange is committed only after a successful LLM reply, preventing failed calls from appearing in history.

## 4. Verification: how to see failover, cache hits and per-message token usage

Health check:

```bash
curl http://localhost:8000/health
```

Normal chat:

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"s-demo","message":"What is the capital of France?"}'
```

Send the same first message with a different new `session_id`. The reply is identical and metadata changes from `LIVE_INFERENCE` to `LLM_CACHE`; `key_id` is `null`. The displayed `input_tokens` and `output_tokens` are for that request only.

With `ENABLE_FAILURE_SIMULATION=true`, demonstrate fallback using a previously unseen message:

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-Simulate-Failure: key_1=429" \
  -d '{"session_id":"s-fallback","message":"Give me a new fact."}'
```

The response is a real answer with `key_id: "key_2"` and `fallback_attempts: 1`. Verify a clean all-provider failure and no history write:

```bash
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -H "X-Simulate-Failure: *=429" \
  -d '{"session_id":"s-unavailable","message":"This must fail."}'
curl http://localhost:8000/sessions/s-unavailable/messages
```

The first command returns `503`; the second returns `404`. Inspect a valid session with `GET /sessions/{session_id}/messages`.

## 5. Setup Used: your editor and AI tools

Replace this section before submission with the editor and AI tools actually used for the assignment.

## 6. Bonus features (if any): what you added beyond the requirements and why

No bonus features are required. The optional per-session system prompt is included because it is explicitly permitted in the assignment.
