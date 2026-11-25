# LYFTR AI — Resilient LLM Chatbot

## 1. Live URLs

- **GitHub Repository**: `https://github.com/NeoGonsalves/lyftr-ai`
- **Frontend**: `https://<your-frontend-url>` (e.g. Vercel / Render Static Site)
- **Backend**: `https://<your-backend-url>` (e.g. Render Web Service / Railway)

### Quick Deployment Instructions

#### Backend Deployment (Render / Railway / Fly.io)
1. Fork or push this repository to GitHub (`https://github.com/NeoGonsalves/lyftr-ai`).
2. Create a new **Web Service** on [Render](https://render.com) (or use the provided `render.yaml`):
   - **Environment**: Docker (Root Directory: `backend` or build context: `./backend`, Dockerfile: `backend/Dockerfile`).
   - **Port**: `8000`
   - **Health Check Path**: `/health`
   - **Environment Variables**:
     - `LLM_MODEL`: `groq/openai/gpt-oss-120b`
     - `LLM_API_KEYS`: `<comma-separated-api-keys>`
     - `DATABASE_URL`: `sqlite:////data/app.db`
     - `LITELLM_CACHE_DIR`: `/data/litellm-cache`
     - `ALLOWED_ORIGINS`: `*` (or your frontend domain)
     - `ENABLE_FAILURE_SIMULATION`: `true`

#### Frontend Deployment (Vercel / Netlify / Render)
1. Create a new project on [Vercel](https://vercel.com) and import the repository.
2. Set **Root Directory** to `frontend`.
3. Set **Framework Preset** to `Vite`.
4. Configure Environment Variable:
   - `VITE_API_BASE_URL`: `https://<your-deployed-backend-url>`
5. Deploy! Vercel will automatically build using `npm run build` with `vercel.json` rewrites.

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

- **Editor**: Visual Studio Code / Antigravity IDE
- **AI Tools**: Antigravity AI Assistant, Groq (OpenAI-compatible high-speed inference)
- **Runtimes & Tools**: Python 3.12/3.13, Node 22, Docker & Docker Compose, GitHub CLI

## 6. Bonus features (if any): what you added beyond the requirements and why

- **Interactive Failover Simulation Header**: A dropdown in the UI allowing instant simulation of `key_1=429`, `key_1=500`, or `*=429` directly in the browser to demonstrate system resilience without terminal commands.
- **Rich Markdown & Table Renderer**: Full support for formatted tables, bold text, code blocks, and bullet points using `marked` styled in high-contrast cyberpunk dark aesthetics.
- **Per-Session System Prompt Drawer**: Interactive configuration field (`data-testid="system-prompt-input"`) mounted directly in the chat interface allowing dynamic personalization of the assistant's behavior.
- **Quick Reply Suggestions & Emoji Selector**: Instant interactive chips (`"What is LYFTR AI?"`, `"Test key failover ⚡"`) and quick emoji picker tray.
- **Collapsible / Minimizable Widget Launcher**: Interactive floating widget button allowing the chat window to be minimized or expanded at will.
