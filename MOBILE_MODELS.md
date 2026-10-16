# Mobile on-device model assessment

## Decision for the first mobile speech-to-text experiment

Use Nasjonalbiblioteket's NB-Whisper Large quantized `q5_0` artifact with [`whisper.rn`](https://github.com/mybigday/whisper.rn), a React Native binding for `whisper.cpp`. NB's model card explicitly documents its Whisper.cpp format and links both the full model and q5_0 version. The current q5_0 artifact is about **1.08 GB**; the full ggml file is about **3.1 GB**. Both are much smaller than the Transformers checkpoint, but still too large to bundle in the application. Offer an explicit, optional download, report the storage requirement, and allow the learner to delete the model.

The q5_0 version is the first candidate because it retains NB-Whisper Large while reducing the download. This does not establish its recognition quality or phone performance. Compare it with NB-Whisper Large used by the desktop helper on the same held-out Norwegian recordings before choosing a default. The model card is Apache-2.0; preserve attribution and review the current card before distributing model weights.

## Runtime requirements and boundaries

- `whisper.rn` runs `whisper.cpp` natively on iOS and Android. Its Expo integration requires `npx expo prebuild`, so this feature needs an Expo development/native build rather than Expo Go alone.
- The runtime accepts a local model path and transcribes audio locally. For push-to-talk, capture mono 16 kHz audio, pass Norwegian language code `no`, and release the native model context when leaving the speech feature.
- Keep the model file in app-private storage. Download it only after the learner chooses to enable speech recognition; show progress, support retry/cancel, and verify the final file before loading it. No audio or transcript should be sent to Norsk Rom servers.
- The Large model is optional because its 1.08 GB q5_0 download and runtime memory use may not suit every phone. Do not claim universal compatibility based on simulator success. Benchmark cold load, transcription time, peak memory, battery/heat and recognition errors on representative real iOS and Android phones.
- `whisper.rn` only provides ASR. It does not add the Borealis conversation model, grammar coaching, pronunciation scoring or TTS. Those remain separate on-device integrations. Existing mobile role-play is still scripted, and pronunciation scoring remains unimplemented.

## Candidate sources

- [NB-Whisper Large model card](https://huggingface.co/NbAiLab/nb-whisper-large): model format, conversion guidance, license, attribution and model limitations.
- [NB-Whisper Large q5_0 file](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model-q5_0.bin): quantized artifact, currently listed as about 1.08 GB.
- [NB-Whisper Large full ggml file](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin): full artifact, currently listed as about 3.1 GB.
- [`whisper.rn` setup and usage](https://github.com/mybigday/whisper.rn): native setup, Expo prebuild requirement and local transcription API.
- [Expo prebuild](https://docs.expo.dev/workflow/prebuild/): generates native iOS and Android projects needed by native modules.

## Local build readiness

This checkout contains a React Native entry file, not a runnable Expo project. At the time of this check, `xcodebuild` cannot run because the active developer directory is Command Line Tools rather than a full Xcode installation; `adb` and the Android emulator are not available on PATH. Docker/Kubernetes cannot replace those device runtimes. Before integrating and verifying the native ASR path, create a dedicated Expo app with a development build and install the full platform toolchains. An iOS Simulator can verify native integration and UI; real phones are still required for meaningful model performance results.

## Acceptance checks for the implementation

1. Install a development build on one iPhone and one Android phone, and confirm the app works with networking disabled after the model is installed.
2. Download q5_0 on demand, validate it, transcribe a short Norwegian sample with `language: 'no'`, cancel a recording, and release the model cleanly.
3. Compare transcript quality with the desktop NB-Whisper Large result using the same learner recordings, including non-native speech and more than one Norwegian spoken variety.
4. Record model download size, peak RAM, cold-start time, real-time factor, heat/battery impact and error cases. Set a minimum-device recommendation from these results.
5. Keep AI conversation, generated exercises and TTS visibly unavailable on mobile until each has its own local runtime and passes the same offline test.
