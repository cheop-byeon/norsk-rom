import RNFS from 'react-native-fs';
import { NB_WHISPER_MODEL, matchesPublishedNbModel } from './nbWhisperModel';
export { NB_WHISPER_MODEL } from './nbWhisperModel';

// whisper.rn 0.7.4 documents these entry points but its package exports omit
// the root index, so resolve the published JavaScript bundle directly.
// @ts-ignore The upstream React Native condition has a few compiler-only type errors.
const { initWhisper } = require('../node_modules/whisper.rn/lib/module/index.js');
const { AudioPcmStreamAdapter } = require('../node_modules/whisper.rn/lib/module/realtime-transcription/adapters/AudioPcmStreamAdapter.js');
const { RealtimeTranscriber } = require('../node_modules/whisper.rn/lib/module/realtime-transcription/RealtimeTranscriber.js');

const modelName = 'nb-whisper-large-q5_0.bin';
const partialName = `${modelName}.download`;
const modelDirectoryPath = `${RNFS.DocumentDirectoryPath}/NorskRomModels`;
const legacyModelPath = `${RNFS.DocumentDirectoryPath}/${modelName}`;
let activeDownloadJob = null;

export const nbWhisperModelPath = `${modelDirectoryPath}/${modelName}`;
const partialPath = `${modelDirectoryPath}/${partialName}`;

export async function getNbWhisperModelStatus() {
  await RNFS.mkdir(modelDirectoryPath, { NSURLIsExcludedFromBackupKey: true });
  // Keep an already-downloaded model when upgrading from the original path.
  if (!(await RNFS.exists(nbWhisperModelPath)) && await RNFS.exists(legacyModelPath)) {
    await RNFS.moveFile(legacyModelPath, nbWhisperModelPath);
  }
  if (!(await RNFS.exists(nbWhisperModelPath))) return { installed: false, bytes: 0 };
  const file = await RNFS.stat(nbWhisperModelPath);
  const bytes = Number(file.size);
  if (bytes !== NB_WHISPER_MODEL.sizeBytes) {
    await RNFS.unlink(nbWhisperModelPath);
    return { installed: false, bytes: 0, invalid: true };
  }
  return { installed: true, bytes };
}

export async function downloadNbWhisperModel(onProgress = () => {}) {
  const fsInfo = await RNFS.getFSInfo();
  const reserve = 256 * 1024 * 1024;
  if (Number(fsInfo.freeSpace) < NB_WHISPER_MODEL.sizeBytes + reserve) {
    throw new Error('Free at least 1.3 GB on this device before downloading NB-Whisper Large.');
  }
  await RNFS.mkdir(modelDirectoryPath, { NSURLIsExcludedFromBackupKey: true });
  if (await RNFS.exists(partialPath)) await RNFS.unlink(partialPath);
  let headerError = null;
  const task = RNFS.downloadFile({
    fromUrl: NB_WHISPER_MODEL.url,
    toFile: partialPath,
    cacheable: false,
    connectionTimeout: 30000,
    readTimeout: 120000,
    progressDivider: 1,
    begin: ({ jobId, statusCode, contentLength, headers }) => {
      if (statusCode < 200 || statusCode >= 300) headerError = new Error(`Model download returned HTTP ${statusCode}.`);
      else if (contentLength > 0 && contentLength !== NB_WHISPER_MODEL.sizeBytes) headerError = new Error('The model file size changed; download stopped for safety.');
      const etag = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === 'etag')?.[1];
      if (!headerError && !matchesPublishedNbModel({ size: contentLength, etag })) headerError = new Error('The model host returned an unrecognized file identity; the download was stopped.');
      if (headerError) {
        onProgress({ error: headerError.message });
        RNFS.stopDownload(jobId);
      }
    },
    progress: ({ bytesWritten, contentLength }) => onProgress({
      bytesWritten,
      contentLength: contentLength || NB_WHISPER_MODEL.sizeBytes,
      fraction: Math.min(bytesWritten / (contentLength || NB_WHISPER_MODEL.sizeBytes), 1),
    }),
  });
  activeDownloadJob = task.jobId;
  try {
    const result = await task.promise;
    if (headerError) throw headerError;
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`Model download returned HTTP ${result.statusCode}.`);
    const file = await RNFS.stat(partialPath);
    const sha256 = await RNFS.hash(partialPath, 'sha256');
    if (!matchesPublishedNbModel({ size: file.size, sha256 })) throw new Error('The downloaded model failed its SHA-256 integrity check; the partial file was removed.');
    if (await RNFS.exists(nbWhisperModelPath)) await RNFS.unlink(nbWhisperModelPath);
    await RNFS.moveFile(partialPath, nbWhisperModelPath);
    return { path: nbWhisperModelPath, bytes: Number(file.size) };
  } catch (error) {
    if (await RNFS.exists(partialPath)) await RNFS.unlink(partialPath).catch(() => {});
    throw error;
  } finally {
    activeDownloadJob = null;
  }
}

export async function cancelNbWhisperModelDownload() {
  if (activeDownloadJob !== null) RNFS.stopDownload(activeDownloadJob);
}

export async function deleteNbWhisperModel() {
  if (await RNFS.exists(nbWhisperModelPath)) await RNFS.unlink(nbWhisperModelPath);
}

export class LocalNbWhisperProvider {
  context = null;
  transcriber = null;
  transcript = '';
  slices = new Map();

  async load() {
    if (this.context) return;
    const model = await getNbWhisperModelStatus();
    if (!model.installed) throw new Error('Download NB-Whisper on this device before using speech input.');
    this.context = await initWhisper({ filePath: `file://${nbWhisperModelPath}`, useGpu: true });
    this.transcriber = new RealtimeTranscriber(
      { whisperContext: this.context, audioStream: new AudioPcmStreamAdapter() },
      {
        audioSliceSec: 20,
        audioMinSec: 1,
        maxSlicesInMemory: 1,
        promptPreviousSlices: false,
        transcribeOptions: { language: 'no', maxThreads: 4 },
        audioStreamConfig: { sampleRate: 16000, channels: 1, bitsPerSample: 16, bufferSize: 16 * 1024 },
      },
      {
        onTranscribe: event => {
          const text = event.data?.result?.trim();
          if (text) {
            this.slices.set(event.sliceIndex, text);
            this.transcript = [...this.slices.entries()].sort(([a], [b]) => a - b).map(([, value]) => value).join(' ');
          }
        },
      },
    );
  }

  async start() {
    await this.load();
    this.transcript = '';
    this.slices.clear();
    await this.transcriber.start();
  }

  async stop() {
    if (!this.transcriber) return '';
    await this.transcriber.stop();
    return this.transcript;
  }

  async release() {
    if (this.transcriber) await this.transcriber.release().catch(() => {});
    if (this.context) await this.context.release().catch(() => {});
    this.transcriber = null;
    this.context = null;
  }
}
