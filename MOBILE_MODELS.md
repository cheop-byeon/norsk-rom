# Mobile on-device model assessment

## Decision for the first mobile speech-to-text experiment

Use Nasjonalbiblioteket's NB-Whisper Large quantized `q5_0` artifact with [`whisper.rn`](https://github.com/mybigday/whisper.rn), a React Native binding for `whisper.cpp`. NB's model card explicitly documents its Whisper.cpp format and links both the full model and q5_0 version. The current q5_0 artifact is about **1.08 GB**; the full ggml file is about **3.1 GB**. Both are much smaller than the Transformers checkpoint, but still too large to bundle in the application. Offer an explicit, optional download, report the storage requirement, and allow the learner to delete the model.

The q5_0 version is the first candidate because it retains NB-Whisper Large while reducing the download. This does not establish its recognition quality or phone performance. Compare it with NB-Whisper Large used by the desktop helper on the same held-out Norwegian recordings before choosing a default. The model card is Apache-2.0; preserve attribution and review the current card before distributing model weights.

## Runtime requirements and boundaries

- `whisper.rn` runs `whisper.cpp` natively on iOS and Android. Its Expo integration requires `npx expo prebuild`, so this feature needs an Expo development/native build rather than Expo Go alone.
- The runtime accepts a local model path and transcribes audio locally. For push-to-talk, capture mono 16 kHz audio, pass Norwegian language code `no`, and release the native model context when leaving the speech feature.
- Keep the model file in app-private storage. Download it only after the learner chooses to enable speech recognition; show progress, support retry/cancel, and verify the final file before loading it. No audio or transcript should be sent to Norsk Rom servers.
- The Large model is optional because its 1.08 GB q5_0 download and runtime memory use may not suit every phone. Do not claim universal compatibility based on simulator success. Benchmark cold load, transcription time, peak memory, battery/heat and recognition errors on representative real iOS and Android phones.
- `whisper.rn` only provides ASR. The optional conversation model is integrated separately, and does not score pronunciation. The authored mobile lesson and grammar example remain demo content.

## Optional local conversation partner

The role-play can use Nasjonalbiblioteket's experimental Borealis 1B Instruct Preview Q4_K_M through [`llama.rn`](https://github.com/mybigday/llama.rn), a native `llama.cpp` binding for React Native. The model is about **806 MB**, pinned to revision `74ded66c3f23bed03588ffd303fef9a8550b4b8b`, and verified against SHA-256 `cd967c356007828923bbf11433296e34775088e63130f567066bcdbce2afdba3`. Its license is Gemma; read the model card and license terms before redistribution. The user must explicitly download and select it. The app releases Whisper before loading Borealis to avoid holding both models in memory.

This is an integration milestone, not proof that every phone can run it well. Borealis is a preview model; generated Norwegian and inferred meanings can be wrong. Measure cold start, reply latency, peak memory, heat and battery on real devices. Do not present its responses as authoritative grammar correction.

## Candidate sources

- [NB Borealis 1B Instruct Preview model card](https://huggingface.co/NbAiLab/borealis-1b-instruct-preview-gguf): GGUF instructions, quantization sizes and Gemma license.
- [NB Borealis 1B Q4_K_M file history](https://huggingface.co/NbAiLab/borealis-1b-instruct-preview-gguf/commit/74ded66c3f23bed03588ffd303fef9a8550b4b8b): published SHA-256 and file size for the pinned artifact.
- [`llama.rn` setup and usage](https://github.com/mybigday/llama.rn): native local llama.cpp inference for React Native.
- [NB-Whisper Large model card](https://huggingface.co/NbAiLab/nb-whisper-large): model format, conversion guidance, license, attribution and model limitations.
- [NB-Whisper Large q5_0 file](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model-q5_0.bin): quantized artifact, currently listed as about 1.08 GB.
- [NB-Whisper Large full ggml file](https://huggingface.co/NbAiLab/nb-whisper-large/blob/main/ggml-model.bin): full artifact, currently listed as about 3.1 GB.
- [`whisper.rn` setup and usage](https://github.com/mybigday/whisper.rn): native setup, Expo prebuild requirement and local transcription API.
- [Expo prebuild](https://docs.expo.dev/workflow/prebuild/): generates native iOS and Android projects needed by native modules.

## Local build readiness

`mobile/` supports opt-in NB-Whisper q5_0 transcription and opt-in Borealis 1B replies through native React Native runtimes. Both downloads are pinned and SHA-256 checked; the models live in app-private storage. Android compiled and launched in an Android 37 emulator. The iOS simulator workflow previously compiled and launched the app; the current llama.rn integration still needs its CI run. No model was downloaded or run during these build checks. Real-phone download, offline inference, microphone use, latency, memory, battery and heat remain to be tested. A simulator cannot establish real-device model performance.

## Acceptance checks for the implementation

1. Install a development build on one iPhone and one Android phone, and confirm the app works with networking disabled after the model is installed.
2. Download q5_0 on demand, validate it, transcribe a short Norwegian sample with `language: 'no'`, cancel a recording, and release the model cleanly.
3. Compare transcript quality with the desktop NB-Whisper Large result using the same learner recordings, including non-native speech and more than one Norwegian spoken variety.
4. Record model download size, peak RAM, cold-start time, real-time factor, heat/battery impact and error cases. Set a minimum-device recommendation from these results.
5. Test Borealis and Whisper separately on a real Android phone, then repeat on an iPhone when one is available. Confirm each works offline after model installation and record cold start, latency, peak memory, heat, battery and recognition or response errors.
6. Add Piper TTS, media imports and lesson generation only after each has a suitable local mobile runtime and passes an offline test.
