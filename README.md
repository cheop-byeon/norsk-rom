> **v0.2 update:** The connected local app is now available. See [CONNECTED_APP.md](CONNECTED_APP.md) for current setup, actual model providers and limitations. Older mock-only instructions below describe the baseline API.

# Norsk rom — connected lesson prototype

An original Norwegian-learning prototype. Includes a responsive browser app and an Expo / React Native entry point. No API keys, publisher articles, network integrations or recorded audio.

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

## iOS / Android source

Requires Node.js and an Expo-compatible mobile development environment. Create a fresh **blank JavaScript** Expo project in a separate directory, using the currently supported Expo dependency set:

```sh
npx create-expo-app@latest norsk-rom-mobile --template blank
```

Copy `App.js` and `model.js` from this directory into the new project root, replacing the generated `App.js`. Keep the generated package.json and lockfile; this folder's package.json is for the dependency-free browser demo and model tests only.

```sh
cd norsk-rom-mobile
npx expo start
```

Follow the Expo CLI instructions for a compatible Expo Go client or simulator. The native version keeps saved phrases in memory for the current app session. It is an entry-point prototype, not an app-store-ready package. Device build and native runtime verification have not been performed here.

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
- `App.js`: React Native / Expo frontend using React Native components and expo-speech.
- `model.js`: shared scenarios, scripted responses, narrow correction fixture, 12 listening-script fixtures (2 per level).
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

For the updated native entry point, install the added dependency inside the generated Expo project:

```sh
npx expo install expo-speech
```

Copy the updated App.js and model.js afterwards. Native TTS uses a detected Norwegian voice; native file import/clipping remains planned. On physical iOS devices, disable silent mode for expo-speech playback. See https://docs.expo.dev/versions/latest/sdk/speech/.

Six model/clip-range tests pass. Browser JavaScript syntax checking passes. Browser visual/interaction verification and native device execution remain unverified.

## Connected-flow verification

Ten logic tests pass. A lightweight DOM test harness also exercised the six-step mock flow, gating, evidence, grammar retry, expression reuse, recap and restart. This is logic verification, not a real-browser rendering or audio test. Browser rendering and native execution remain unverified.

The connected lesson transcript is split into sentences. Learners can replay one sentence with the configured TTS voice and tap individual words for a hint. Hints use the lesson's generated expression meanings first, then a small bundled starter glossary; unsupported words are identified as having no hint. Sentence highlighting follows the selected sentence, not precise word timing in the original recording.

## Backend foundation (3 October 2026)

A runnable FastAPI service now lives in `backend/`. See `backend/README.md` for setup, token authorization, API contracts and the live demonstration script. It provides durable sessions, quiz review, scripted role-play, recaps, private phrasebooks and a durable demo-job worker. Ten API tests pass, and a live HTTP walkthrough was completed. Real speech/media providers and Supabase Auth are not connected. The browser preview still runs independently of the backend.

Run `python3 build-bundle.py` to package source without local credentials or databases. The backend-only archive is generated alongside the full starter archive.
