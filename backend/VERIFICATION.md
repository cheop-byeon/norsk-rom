# Verification — 8 October 2026

## NB-Whisper Large update — 14 October 2026
- Downloaded and configured `NbAiLab/nb-whisper-large` locally. The running API reports the Large provider; Apple Silicon inference uses MPS when available.
- Synthetic round-trip test loaded both checkpoint shards and transcribed Piper-generated “Det bøtter ned.” as “Det bøtte ned.” in 24.8 seconds. This verifies that the model loads and handles Norwegian audio, but also shows Large can still miss a reduced ending; this is not a human pronunciation assessment.
- Tests: 45 passed; one unrelated scanned-PDF test was deselected because the active environment lacks the existing `pypdf` dependency (`test_scanned_pdf_reports_that_ocr_is_not_available`).

- 13 backend tests passed: baseline lesson transitions, persistence, owner isolation, concurrent revisions, idempotency, media job leases; plus private generated lessons, generation retry conflicts, source-evidence rejection, provider failures and static asset allowlist.
- 2 frontend API-client tests passed: lost-response retry preserves request ID across client recreation; revision conflicts clear pending state without fake success.
- Actual local inference: Piper synthesized “Hei! Jeg vil gjerne ha en kaffe med havremelk.”; NB-Whisper Tiny returned the same sentence (punctuation normalized).
- Actual HTTP integration: generated a new library-themed listening lesson, answered its questions, began a context-aware Ollama role-play and completed the saved session.
- Browser: connected via local test token, completed quiz with evidence, saved phrase, sent novel tea question, received live Norwegian reply, completed recap and reloaded with persisted state. Fixed native-fetch binding bug discovered during this test. Screenshot in ../connected-proof.jpg.
- Human microphone permission/recording, dialect accuracy, grammar quality across levels and full phone-browser support were not verified. No pronunciation assessment was tested or claimed.
- Test fixtures are isolated from the user's app database. Live HTTP smoke generated one example lesson/session in the local app database.

## Opplest integration, 9 October 2026
- 19 backend tests pass, including provider-specific request contracts and approved download hosts. 2 API-client tests pass.
- Both direct Gradio HTTP and standard Gradio client returned real Opplest audio.
- Actual authenticated app endpoint returned HTTP 200 with `X-Speech-Provider: nb_voxcpm_space`, 48 kHz WAV, 3.38 seconds of audio, in 2.11 seconds. Repeat request took 0.002 seconds.
- Python dependency consistency check passed after the diagnostic Gradio client installation. Production adapter uses existing httpx; no Gradio dependency is required.
