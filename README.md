> **v0.2 update:** The connected local app is now available. See [CONNECTED_APP.md](CONNECTED_APP.md) for current setup, actual model providers and limitations. Older mock-only instructions below describe the baseline API.

# Norsk rom — connected lesson prototype

An original Norwegian-learning prototype with a connected browser app and an earlier Expo / React Native entry point. Current providers and setup are documented below and in [CONNECTED_APP.md](CONNECTED_APP.md).

> **Product direction (15 October 2026):** Norsk Rom will be fully on-device. Learners run the web version on their own computer and install the mobile version on their phone; lessons, recordings, history and model inference stay on that device. GitHub distributes the source/releases, not a hosted app service. Do not add cloud accounts, databases, file storage, analytics, remote AI APIs or automatic uploads.
>
> **Current prototype gap:** models and storage use the computer running the local FastAPI helper; the browser app is not standalone, and the mobile `App.js` is an earlier prototype. The on-device direction is the migration target, not a claim about the current build. See [MASTER_PROMPT.md](MASTER_PROMPT.md) for the decision and migration sequence.

## Start here: My lesson

The browser now opens on a complete **A2 café lesson**:

1. Listen to one fictional café scene, or explicitly continue without audio in mock mode.
2. Answer two questions from that scene.
3. Check answers and replay the supporting lines using device speech.
4. Practise and save two expressions drawn from those lines.
5. Use those expressions in a scripted café role-play. Insert a simulated spoken answer, confirm/edit it, see a predefined grammar correction, and retry.
6. View a recap based on the answers, self-reported practice, and expression matches from this session.

The same source clip and expressions remain visible throughout. The scene's source offsets are illustrative, not measured device-speech timings. The surrounding clips are context placeholders. Microphone capture and AI feedback are not connected. The global level selector applies to the separate listening studio; this connected lesson is fixed at A2.

This connected flow is implemented in the **browser frontend**. `App.js` is still the earlier native starter with separate activities; native parity is a subsequent task.

New files: `lesson-model.js` (connected fixtures and state helpers), `lesson.js` (six-step browser lesson), `lesson-model.test.js` (evidence consistency, retained state, correction and retry checks), `build-preview.js` (self-contained preview builder).

Run all logic tests with `npm test`. Regenerate the standalone HTML after source edits with `npm run build`.

## Browser preview

For the quickest preview, open `preview.html` directly in your browser. It is a self-contained copy of the browser frontend.

For the modular source version, use Python 3. From this directory:

```sh
python3 -m http.server 8080 --bind 127.0.0.1
```

Open http://localhost:8080 in a browser. Use a local server: opening index.html directly may block ES-module imports. Browser assets are local; no CDN requests are made. The browser phrasebook uses localStorage, with an in-memory fallback.

## Android / iOS app

The mobile project is in [`mobile/`](mobile/), using Expo and React Native. It offers optional local speech recognition with NB-Whisper Large q5_0 (1.08 GB) and an AI role-play partner with NB Borealis 1B (806 MB); both models are downloaded only when selected. The Android debug app now compiles and launches in an emulator. Real-phone audio and AI inference tests remain. Start it in an Android emulator with Android Studio, Java 17 and the Android SDK installed:

```sh
cd mobile
npm ci
npm run android
```

The first Android build downloads the Android NDK and other build dependencies. Native AI requires a development build; it is not available in Expo Go. Listening lessons are still authored demo content, Piper and media imports are not on mobile yet. See [`mobile/README.md`](mobile/README.md) and [MOBILE_MODELS.md](MOBILE_MODELS.md) for current limits.

## Try these flows

1. Choose one of three scenarios and start a conversation.
2. Tap a support expression to prepare a reply; send it. Tap + to save it.
3. In the café, ask “Hva koster den?” to trigger a matching scripted response.
4. Insert the grammar example and send “Jeg er gå på kafé.” to see the predefined correction to “Jeg går”. Other input is not assessed for grammar.
5. Try simulated voice: it inserts a canned transcript without opening the microphone.
6. Finish and inspect the turn count. Pronunciation is explicitly not assessed.
7. Open Listen & practise / Listen, choose A1–C2, play the sample, answer the question, and switch to the second sample.
8. Open the phrasebook and remove a saved expression.

## Files

- `index.html`: responsive layout and styling, no remote assets.
- `web.js`: browser navigation, state, local phrasebook, exercise interactions.
- `App.js`: React Native / Expo frontend using device speech and local phrase storage.
- `model.js`: shared scenarios, scripted responses, narrow correction fixture, listening fixtures, sentence splitting and bundled word hints.
- `model.test.js`: deterministic logic tests.
- `package.json`: browser demo metadata and test command; no npm dependencies.

## What is simulated

| Capability | Status |
|---|---|
| Scenario selection, phrase help, text entry, phrase saving, recap | Interactive frontend |
| Conversation | Short script plus a few intent keywords, not AI |
| Grammar feedback | One known example, not a grammar checker |
| Voice | Role-play uses canned input; listening uses Norwegian device TTS |
| Pronunciation | Not assessed |
| Listening levels | Authored illustrative scripts, not validated CEFR scoring |
| New exercises | Switches between two fixtures per level, not generation |
| News ingestion, NB-Whisper, accounts | Not connected; device TTS available when a Norwegian voice exists |
| Level-adaptive role-play | Planned in master prompt; listening sample level changes only |

Run shared-model tests with Node.js:

```sh
node --test model.test.js
```

See the accompanying `MASTER_PROMPT.md` for the complete product brief, provider architecture, assessment limitations and integration plan.

## Verification performed

Six shared-model/clip tests passed, and browser JavaScript passed Node syntax checking. Visual/browser interaction verification was blocked by this environment: local server binding was denied, browser automation could not launch, and the in-app browser rejected local-file navigation. Native device execution remains unverified.

## Speaking and listening update

The reading screen has been replaced with **Listen & practise** (native: **Listen**). The source script is hidden by default. Play a sample to completion before checking an answer; revealing its transcript is optional help. The browser records whether transcript help was used for the current sample. Native transcript-help scoring is not implemented yet.

Browser additions:
- Norwegian device text-to-speech for the 12 fictional samples and pasted text.
- Local audio/video selection; no upload.
- 10/20/30/60-second playback ranges, replay, looping and playback speed.
- No automatic transcription, custom question generation, semantic segmentation or clip export. Fixed windows may cut speech; the master prompt specifies natural-boundary segmentation for production.

A Norwegian system/browser voice must be available for TTS. If unavailable, the UI reports it; it never silently uses an English voice. Device speech processing depends on the OS/browser. Local media decoding depends on supported codecs. Test actual playback on your target devices.

The native demo now lives in [`mobile/`](mobile/). It includes the six-step lesson, device TTS, phrase storage and an optional, native NB-Whisper push-to-talk route. See [`mobile/README.md`](mobile/README.md) for current setup and limitations. This older standalone prototype is retained as a reference.

Six model/clip-range tests pass. Browser JavaScript syntax checking passes. Browser visual/interaction verification and native device execution remain unverified.

## Connected-flow verification

Ten logic tests pass. A lightweight DOM test harness also exercised the six-step mock flow, gating, evidence, grammar retry, expression reuse, recap and restart. This is logic verification, not a real-browser rendering or audio test. Browser rendering and native execution remain unverified.

The connected lesson transcript is split into sentences. Learners can replay one sentence with the configured TTS voice and tap individual words for a hint. Hints use the lesson's generated expression meanings first, then a small bundled starter glossary; unsupported words are identified as having no hint. Sentence highlighting follows the selected sentence, not precise word timing in the original recording.

## Local setup

On macOS, install Python 3.12 (recommended) and Ollama, then double-click `setup_norsk_rom.command`. Its guided setup installs the local Python environment, creates a private local key, checks models and asks before large model downloads. Double-click `start_norsk_rom.command` to launch the local API and open the app. Run `python3.12 setup_local.py --check` to inspect readiness later.

The connected web app and its model inference run on the user's computer; internet is needed only for first-time dependency/model downloads or optional online-source imports. Local state and models are under `backend/.data/`. The native app now has optional NB-Whisper transcription and NB Borealis role-play. Real-phone downloads, microphone, model quality, latency and memory checks remain. Piper, lesson generation and media imports are not integrated on mobile. See [MOBILE_MODELS.md](MOBILE_MODELS.md) for the model/runtime assessment and [CONNECTED_APP.md](CONNECTED_APP.md) for the current web flow.

## Backend foundation (3 October 2026)

A runnable FastAPI service now lives in `backend/`. See `backend/README.md` for setup, token authorization, API contracts and the live demonstration script. It provides durable sessions, quiz review, role-play, recaps, private phrasebooks and a durable demo-job worker. Hosted speech providers have been disabled; media transcription and speech synthesis use local models. The helper service still runs on the user's computer, so this is not yet a browser-only or mobile on-device build. Supabase Auth is not connected. The browser preview still runs independently of the backend.

Run `python3 build-bundle.py` to package source without local credentials or databases. The backend-only archive is generated alongside the full starter archive.

## Models, providers and attribution

Norsk Rom uses different models for speech recognition, speech generation and conversation. The local backend defaults are:

| App function | Model/provider | Where it runs |
|---|---|---|
| Norwegian speech recognition (ASR) | [NB-Whisper Large](https://huggingface.co/NbAiLab/nb-whisper-large), `NbAiLab/nb-whisper-large` | Locally on the backend computer (MPS on supported Apple Silicon, otherwise CPU) |
| Spoken replies (TTS) | [Piper Norwegian Bokmål `talesyntese-medium`](https://huggingface.co/rhasspy/piper-voices/blob/main/no/no_NO/talesyntese/medium/MODEL_CARD) | Locally on the backend computer |
| Role-play conversation, grammar suggestions and lesson/question generation | [NB Borealis Open 4B](https://huggingface.co/NbAiLab/borealis-open-4b-gguf), served by [Ollama](https://ollama.com/) | Locally on the backend computer |
| App data | SQLite via SQLAlchemy | Locally |

The text model is NB's Norwegian-centric Borealis Open 4B. NB-Whisper handles speech recognition only; it does not create replies or speak them. Piper is a separate text-to-speech project. The Norwegian voice uses material associated with NB Språkbanken, but Piper is not an NB model or API; see its model card for dataset attribution and license details. Borealis Open 4B is based on Gemma 3 and uses the Gemma license; see the model card for terms.

The app exposes local inference only. NB-Whisper Large runs locally for transcription; Borealis Open 4B runs locally through Ollama for role-play and generated exercises; Piper runs locally for speech synthesis. NB Whisper is speech-to-text, not a speaking model. Hosted Hugging Face Space calls are disabled in the connected app and backend. The current web prototype still uses a local FastAPI helper on the computer; a native, fully on-device mobile implementation remains future work.

Thank you to [Nasjonalbiblioteket's AI Lab](https://ai.nb.no/) for developing and sharing NB-Whisper and the Norwegian Opplest speech models. Norsk Rom is an independent project and is not affiliated with or endorsed by Nasjonalbiblioteket. Model and software licenses apply separately; review each linked model card before redistribution or deployment. For local setup and provider settings, see [CONNECTED_APP.md](CONNECTED_APP.md) and [backend/README.md](backend/README.md).
