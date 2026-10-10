> **Playful design update:** Candy-inspired colours, a CSS mascot, rounded raised controls, a six-step lesson path and an expandable voice/listening settings panel. No external fonts or image assets are required. Existing voice, transcription and learning flows are retained.

> **Speech recognition options:** Local NB-Whisper Tiny remains the default. Hosted NB-Whisper Large is an experimental selection that uploads only the selected audio range to NB's public Space. The hosted server returned 503 / runtime error during implementation, so successful remote transcription has NOT been verified. The adapter discovers the expected API contract at runtime and fails clearly if unavailable or changed. There is no silent switch between local and remote. Install optional dependencies with `pip install -e '.[hosted]'` on a fresh machine. Hosted selection resets to local on page reload; voice preferences remain saved.
>
> For mobile, both modes already call your app's backend: 'local' means the model runs on the backend computer, not in the browser. A phone can remain lightweight with a self-hosted backend as well. Public demos are experimental and not a production availability guarantee.

> **Voice controls:** Speaking voice offers Female/Male Oslo voices; Speaking pace offers Slowest (Rolig), Normal and Fast (Rask). Default is female + slowest. Choices are remembered on this browser/device and sent with each synthesis request; cached audio is separated by voice and pace. The existing 0.8× playback control can slow the resulting audio further.

> **Working Opplest integration — 9 October 2026:** The active voice is now `nb_voxcpm_space`, NB’s Opplest/VoxCPM2 female Oslo voice, via its public Hugging Face demo. MOSS Nano is a separate Space and still had model-loading failures. Opplest returned valid 48 kHz audio through this app in 2.11 seconds once available; identical replay from in-memory cache took 0.002 seconds. The first direct request took 149 seconds including waiting/startup. These are observations, not guaranteed latency. Only synthesis text goes to the remote Space; NB-Whisper and Ollama remain local.
>
> Select with `NORSK_TTS_PROVIDER=nb_voxcpm_space` or private configuration `"tts_provider": "nb_voxcpm_space"`, then restart. `piper` remains an explicit local option, not an automatic fallback. Public demo availability and queue time can vary.

> **Timeout correction — 9 October 2026:** Remote speech now has a ten-minute backend budget and a slightly longer browser timeout, an elapsed-time display, and duplicate-click protection. A new live test failed in 3.9 seconds because the Space could not load its model; this was not a timeout. The app distinguishes that server failure from slow generation. Piper remains the active voice.

> **MOSS Nano API integration — 9 October 2026:** The backend now supports `NORSK_TTS_PROVIDER=nb_moss_nano_space`. It sends only synthesis text to NB’s public Hugging Face demo; recognition and conversation stay local. The live API accepted a request but failed while loading its own `NbAiLab/nb-tts-norwegian-moss-nano-trimmed` checkpoint. No audio was returned. Piper remains active until the upstream demo works. There is no silent fallback.
>
> To enable after recovery, start the backend with `NORSK_TTS_PROVIDER=nb_moss_nano_space` in its environment, or set `"tts_provider": "nb_moss_nano_space"` in the private backend configuration and restart. Set it to `piper` to restore the local voice. The frontend displays remote processing explicitly. Requests split long text into short pieces, use neutral playback speed, cache completed audio in memory, and return a clear error on timeout or provider failure. Automated mocked tests cover API success, remote failure, download-host validation and text splitting; actual successful MOSS audio remains unverified.

# Norsk rom — connected local app, v0.2

Open http://127.0.0.1:8000/app/ while the API is running. The old `preview.html` is an offline design prototype; its banner links to the connected app.

On the connection screen, choose `backend/.local-config.json`. On macOS, press Command–Shift–G in the file chooser and enter its full path if hidden files are not visible. Only the existing API key is read, kept in this tab's session storage and sent to your own backend. Sign out clears it. Never share this file.

## What works

- Listen → two comprehension questions → source evidence → useful expressions → conversation → saved recap.
- Real Norwegian audio synthesis, speech transcription with an editable confirmation step, typed or recorded conversation turns, and optional grammar suggestions.
- Library of private generated lessons and saved sessions; phrase saving and playback.
- Studio accepts Norwegian text or a local audio/video file up to 12 MB. Choose a range of 0.25–90 seconds, transcribe it, correct the text and generate a connected lesson. Question difficulty can target A1–C2, without claiming certified CEFR calibration.
- Original media plays in Studio. Lesson replay synthesizes the confirmed transcript; it does not replay the original programme. The backend does not retain raw uploaded media.
- Server-owned progress, owner isolation, revision checks and retry request IDs prevent duplicate conversation actions after interrupted requests.

## Where the audio and intelligence come from

| Task | Current provider |
|---|---|
| Speech to text | Local `NbAiLab/nb-whisper-tiny`, from Nasjonalbiblioteket |
| Spoken output | Local Piper `no_NO-talesyntese-medium` voice |
| Conversation, grammar suggestions, questions | Local Ollama `llama3.2:latest` |
| Storage | Local SQLite via SQLAlchemy |

NB-Whisper recognizes speech; it does not generate the spoken replies. Piper's voice card identifies the NB Språkbanken dataset and CC0 dataset license. Piper itself is a separate project (GPL-3.0 engine); it is not an official NB API. The app makes local HTTP calls to its FastAPI backend and Ollama, with no paid cloud calls in this configuration. Setup downloads models from Hugging Face. Model assets and their applicable licenses are separate from this source bundle.

References: [NB-Whisper Tiny](https://huggingface.co/NbAiLab/nb-whisper-tiny), [Piper voice model card](https://huggingface.co/rhasspy/piper-voices/blob/main/no/no_NO/talesyntese/medium/MODEL_CARD), [Piper engine](https://github.com/OHF-Voice/piper1-gpl), [Ollama Llama 3.2](https://ollama.com/library/llama3.2).

## Start again on this machine

From `/Users/jiebi/Documents/Codex/2026-10-01/i-x20/outputs/norsk-rom/backend`:

```sh
../../../work/live-venv/bin/python -m uvicorn norsk_api.main:create_app --factory --host 127.0.0.1 --port 8000
```

Ollama must be running with `llama3.2:latest` installed. The downloaded speech models and your configuration are already present on this machine. Do not start a second server if port 8000 is already in use.

## Set up a fresh machine

Use Python 3.12 and install Ollama from its official distribution. From the extracted `backend` directory:

```sh
python3.12 -m venv .venv
.venv/bin/python -m pip install -e '.[live,test]'
.venv/bin/python init_dev.py
.venv/bin/python setup_local_models.py
ollama pull llama3.2:latest
.venv/bin/python -m uvicorn norsk_api.main:create_app --factory --host 127.0.0.1 --port 8000
```

Keep the connected frontend files alongside the backend directory. `requirements.live.lock.txt` records the tested macOS Python 3.12 environment; platform wheel availability may differ. Model setup pins NB-Whisper and records the resolved Piper revision. Downloads require network access and several GB of free storage for dependencies and models. No model weights or private local data are included in the ZIPs.

## Boundaries of this version

This is a working local browser MVP. The React Native `App.js` remains an earlier prototype and is not wired to this backend. Production accounts, deployment, realtime streaming voice, validated pronunciation feedback, automatic long-programme segmentation, and NRK/programme ingestion are not implemented. Studio selects a time range manually and uploads the whole bounded-size file. Generated answer evidence is checked against source text, but semantic correctness and CEFR quality still need human review. NB-Whisper Tiny and the small local conversation model trade quality for speed; grammar suggestions and dialect recognition can be imperfect.

No proficiency or pronunciation score is invented. Recorded human microphone input and dialect performance still need your real-device testing; the automated speech round-trip used synthesized Norwegian audio.
