> **v0.2 update:** The connected local app is now available. See [CONNECTED_APP.md](../CONNECTED_APP.md) for current setup, actual model providers and limitations. Older mock-only instructions below describe the baseline API.

# Norsk rom backend · v0.1

A runnable FastAPI backend for the connected A2 café lesson. It persists actual session state, quiz answers, evidence, practice marks, scripted turns, correction retries, phrase matches and recaps. It uses the same authored lesson as the browser prototype.

**Implemented:** authenticated API, durable lesson sessions, controlled step progression, idempotency, optimistic concurrency, private phrasebooks, deletion, OpenAPI docs, and a separate durable **demo-only** lesson-preparation worker.

**Current speech/media flow:** local NB-Whisper handles short clips. Optional Hosted NB-Whisper uploads selected clips to NB's public Hugging Face Space; its full-recording endpoint accepts local files up to 50 MB and 30 minutes, then returns timestamped practice clips. Install optional dependencies with `pip install -e '.[hosted]'`. The public Space is currently paused, so remote transcription is unavailable until it resumes. Speech recognition never falls back between local and hosted providers silently. Pronunciation assessment is not implemented, and the demo worker still prepares authored fixtures rather than processing media.

## Run locally

Use Python 3.11+ (tested here on Python 3.14). From this `backend` directory:

```sh
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock.txt
python init_dev.py
./run_dev.sh
```

`run_dev.sh` starts Uvicorn in development mode and watches `norsk_api/`. Python backend changes reload automatically; you do not need to stop and relaunch the server for each feature. Browser files are served directly from disk, so after HTML/CSS/JavaScript edits, refresh the page if the browser has not picked them up. Stop the server only when you are finished with this development session, or to change its environment/configuration.

- API explorer: http://127.0.0.1:8000/docs
- OpenAPI: http://127.0.0.1:8000/openapi.json
- Health: http://127.0.0.1:8000/health

`init_dev.py` creates a private `.local-config.json` containing a random development API key mapped to `local-learner`. It never overwrites an existing key. Open that local file and paste the key into **Authorize** in `/docs`. Send `Authorization: Bearer <key>` with API requests. Do not commit or share the config file. The source archive excludes it.

The server defaults to a persistent SQLite database at `.data/norsk.db`. Restarting the process preserves sessions. This is local development authentication, **not Supabase login**. No cloud account or paid AI service is required.

To run the complete lesson against the running API, in a second terminal with the environment activated:

```sh
python demo_client.py
```

The script uses the local key without printing it, completes a mock lesson and prints its recap. It intentionally leaves that sample session in the database for inspection. It does not record audio or charge an AI provider.

## API workflow

All `/v1` routes require a token. The token determines the learner; clients cannot choose another owner in request bodies.

1. `GET /v1/lessons` — authored A2 lesson, questions without answer keys, expressions and clip identity.
2. `POST /v1/sessions` with `{"request_id":"<new UUID>"}` — start at `listen`.
3. Optional `POST /v1/sessions/{id}/transcript-help` — mark help used.
4. `POST /v1/sessions/{id}/listening` with `mode: "played_self_reported"` or `"mock_skip"` — move to questions. Playback is self-reported, never claimed as verified.
5. `POST /v1/sessions/{id}/answers` with `answers: {"q1":1,"q2":2}` — submit both answers once; receive correct answers, explanations and supporting source lines.
6. Optional `POST /v1/sessions/{id}/practice` with `phrase_id: "p1"`, `practised: true` — self-report expression practice.
7. `POST /v1/sessions/{id}/roleplay` — receive the barista's opening.
8. `POST /v1/sessions/{id}/turns` with `text` and optional `input_mode` — scripted reply, a narrow grammar fixture and literal expression matches.
9. `POST /v1/sessions/{id}/complete`, then `GET /v1/sessions/{id}/recap`.

Every session-changing request after creation must also include a fresh UUID `request_id` and the latest integer `revision` from the previous response. Example:

```json
{
  "request_id": "4e150fe8-322f-4eca-99a8-6a2c218127fe",
  "revision": 0,
  "mode": "mock_skip"
}
```

- Retrying the **same action and payload** with the same request id returns its original response, including its original revision. It does not duplicate turns. If newer actions have since occurred, fetch the latest session before the next mutation.
- Reusing an id for a different action/payload returns 409.
- A stale revision returns 409. Fetch the current session, reconcile your UI, and retry intentionally. Do not blindly overwrite another device's changes.
- Answers cannot be resubmitted within a session. Start a new session for a new attempt.
- A completed session is immutable except for deletion. Recap results distinguish self-report, mock input and literal text matches.
- A session is capped at 50 turns / 250 mutations to bound local demo storage. The API is not a certified exam system.

Additional routes:

| Route | Purpose |
|---|---|
| `GET /v1/capabilities` | Explicit provider availability and supported levels |
| `POST /v1/speech/pronunciation-check?target=...` | Transcribe a short phrase and compare recognized words with the target; this is a rough hint, not phonetic scoring |
| `GET /v1/lessons/{id}/script` | Authored text for device TTS; requesting it does not imply learner transcript help |
| `GET /v1/sessions?limit=20&offset=0` | Current learner's session history |
| `GET /v1/sessions/{id}` | Resume session |
| `DELETE /v1/sessions/{id}` | Delete the learner's session and idempotency records |
| `GET /v1/phrases` | Current learner's saved expressions |
| `PUT /v1/phrases/p1` | Idempotently save a known fixture phrase |
| `DELETE /v1/phrases/p1` | Remove saved expression |

The script endpoint intentionally exposes text for device speech. Hiding transcripts is a learning interaction, not anti-cheating security. A production frontend must call transcript-help when it reveals text to the learner.

## Durable demo jobs

`POST /v1/jobs` with a UUID `request_id` creates a queued `prepare_demo_lesson` job. Optional fields `kind` and `source_id` accept only that demo kind and the authored café lesson id. Arbitrary media/URLs are rejected; no ingestion is silently simulated.

Run a worker in another terminal:

```sh
python -m norsk_api.worker --once
# Or keep polling for jobs:
python -m norsk_api.worker
```

`GET /v1/jobs/{id}` reports progress. `POST /v1/jobs/{id}/cancel` cancels queued/running jobs. A completed job stays completed. A crashed worker's lease expires after 60 seconds, allowing a later worker to reclaim it. Conditional updates prevent a cancelled job being marked successful by its old worker. This lightweight DB-backed worker handles fixtures only; real media work needs bounded retries, resource limits, longer lease renewal and proper media cleanup before enablement.

## PostgreSQL and Supabase path

The SQLAlchemy models and driver support a PostgreSQL connection string:

```sh
export NORSK_DATABASE_URL='postgresql+psycopg://USER:PASSWORD@HOST:5432/postgres'
```

Use your provider's SSL settings and securely injected credentials. PostgreSQL/Supabase has **not been integration-tested** here. SQLite is the verified local persistence mode. First startup creates the initial schema; `create_all` is not a schema migration system. Add Alembic migrations before evolving a shared/production database. Migrating existing SQLite rows is a separate step.

Supabase Auth integration should replace the local token map with verified Supabase JWT identity; preserve all owner checks. Do not expose this database directly to clients until suitable RLS policies exist. Supabase Storage, uploads and media permission records remain future work. Neither server startup nor tests connect to a cloud service.

## Frontend integration

The browser app is wired to this API. Studio offers short-clip transcription and the optional hosted long-recording workflow; source text and generated lessons follow the API flow. `demo_client.py` demonstrates the session contract; `/docs` allows interactive calls. Use the session response as the source of truth when connecting Expo or the browser:

- Hold the latest session id and revision in application state.
- Generate one request id per user action; preserve it for network retries.
- Obtain the token from a login/development setting, never hardcode it in distributed frontend code.
- Keep server/provider secrets out of frontend bundles.
- Serve browser files over HTTP (`python3 -m http.server 8080` from the frontend folder) when integrating. File URLs are intentionally not allowed as CORS origins.
- Default allowed origins are `http://localhost:8080` and `http://127.0.0.1:8080`. Override with comma-separated `NORSK_CORS_ORIGINS` for explicit development origins.

## Verify

```sh
python -m pytest -q
```

Tests cover the entire lesson, restart persistence, answer evidence, grammar retries, owner isolation, request validation, duplicate and concurrent writes, phrase saves, deletion, demo jobs, cancellation and expired leases. See `VERIFICATION.md` for actual results and limitations.

## Project layout

- `norsk_api/main.py`: API factory, authentication and routes.
- `norsk_api/service.py`: lesson progression, idempotency and recap.
- `norsk_api/schemas.py`: validated input contracts.
- `norsk_api/database.py`: SQLAlchemy models and connection setup.
- `norsk_api/providers.py`: provider boundaries and scripted conversation.
- `norsk_api/cafe_lesson.json`: fixture shared with the current frontend design.
- `norsk_api/jobs.py`, `worker.py`: durable demo worker.
- `init_dev.py`, `demo_client.py`: local setup and API walkthrough.
- `requirements.lock.txt`: exact versions from the verified environment.

Bind to loopback for development. Before public deployment, replace development auth, add migrations, rate/request-size limits and operational monitoring. This starter does not claim production readiness.
