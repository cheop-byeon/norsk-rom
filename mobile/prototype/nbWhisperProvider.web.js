export const NB_WHISPER_MODEL = Object.freeze({
  name: 'NB-Whisper Large q5_0',
  sizeBytes: 1080000000,
});

export async function getNbWhisperModelStatus() {
  return { installed: false, bytes: 0 };
}

export async function downloadNbWhisperModel() {
  throw new Error('NB-Whisper speech input is available in native Android and iOS builds, not the browser version.');
}

export async function cancelNbWhisperModelDownload() {}
export async function deleteNbWhisperModel() {}

export class LocalNbWhisperProvider {
  async start() {
    throw new Error('NB-Whisper speech input is available in native Android and iOS builds, not the browser version.');
  }

  async stop() {
    return '';
  }

  async transcribeFile() {
    throw new Error('Local audio transcription is available in installed Android and iOS builds.');
  }

  async cancelFileTranscription() {}

  async release() {}
}
