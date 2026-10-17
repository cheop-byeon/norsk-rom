import RNFS from 'react-native-fs';
import { Buffer } from 'buffer';
import { createAudioPlayer } from 'expo-audio';
import { createTTS } from 'react-native-sherpa-onnx/tts';
import { fileModelPath } from 'react-native-sherpa-onnx';
import { extractArchive } from 'react-native-sherpa-onnx/extraction';

export const PIPER_VOICE = Object.freeze({
  name: 'Norwegian Bokmål · Talesyntese medium',
  modelId: 'vits-piper-no_NO-talesyntese-medium',
  url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-piper-no_NO-talesyntese-medium.tar.bz2',
});

const modelRoot = `${RNFS.DocumentDirectoryPath}/NorskRomModels`;
const archivePath = `${modelRoot}/${PIPER_VOICE.modelId}.tar.bz2`;
const voiceDirectory = `${modelRoot}/${PIPER_VOICE.modelId}`;
let activeDownload = null;

export async function getPiperStatus() {
  const modelPath = `${voiceDirectory}/no_NO-talesyntese-medium.onnx`;
  return { installed: await RNFS.exists(modelPath), path: voiceDirectory };
}

export async function downloadPiperVoice(onProgress = () => {}) {
  await RNFS.mkdir(modelRoot, { NSURLIsExcludedFromBackupKey: true });
  const { freeSpace } = await RNFS.getFSInfo();
  if (Number(freeSpace) < 400 * 1024 * 1024) throw new Error('Free at least 400 MB on this device before installing the Piper voice.');
  if (await RNFS.exists(archivePath)) await RNFS.unlink(archivePath);
  const task = RNFS.downloadFile({
    fromUrl: PIPER_VOICE.url, toFile: archivePath, cacheable: false,
    connectionTimeout: 30000, readTimeout: 180000, progressDivider: 1,
    begin: ({ statusCode, jobId }) => { if (statusCode < 200 || statusCode >= 300) { activeDownload = null; RNFS.stopDownload(jobId); } },
    progress: ({ bytesWritten, contentLength }) => onProgress({ fraction: contentLength ? bytesWritten / contentLength : 0 }),
  });
  activeDownload = task.jobId;
  try {
    const result = await task.promise;
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`Piper voice download failed (HTTP ${result.statusCode}).`);
    const archive = { modelId: PIPER_VOICE.modelId, archivePath, format: 'tar.bz2' };
    await extractArchive(archive, modelRoot, { force: true });
    const status = await getPiperStatus();
    if (!status.installed) throw new Error('The downloaded Piper archive did not contain the expected Norwegian voice files.');
    await RNFS.unlink(archivePath).catch(() => {});
    return status;
  } finally { activeDownload = null; }
}

export function cancelPiperDownload() { if (activeDownload !== null) RNFS.stopDownload(activeDownload); }

export class LocalPiperProvider {
  engine = null;
  player = null;

  async load() {
    if (this.engine) return;
    const status = await getPiperStatus();
    if (!status.installed) throw new Error('Install the on-device Piper Norwegian voice first.');
    this.engine = await createTTS({ modelPath: fileModelPath(status.path), modelType: 'vits', numThreads: 2, modelOptions: { vits: { lengthScale: 1.25 } } });
  }

  async speak(text, { rate = 1 } = {}) {
    await this.load();
    const audio = await this.engine.generateSpeech(String(text).slice(0, 1800), { speed: rate });
    const pcm = Buffer.alloc(audio.samples.length * 2);
    for (let i = 0; i < audio.samples.length; i++) pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(audio.samples[i] * 32767))), i * 2);
    const wav = Buffer.alloc(44 + pcm.length);
    wav.write('RIFF', 0); wav.writeUInt32LE(36 + pcm.length, 4); wav.write('WAVE', 8); wav.write('fmt ', 12);
    wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(audio.sampleRate, 24);
    wav.writeUInt32LE(audio.sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
    const output = `${RNFS.CachesDirectoryPath}/norsk-rom-tts-${Date.now()}.wav`;
    await RNFS.writeFile(output, wav.toString('base64'), 'base64');
    this.player?.remove();
    this.player = createAudioPlayer({ uri: `file://${output}` });
    this.player.play();
  }

  stop() { this.player?.pause(); }
  async release() { this.stop(); this.player?.remove(); this.player = null; if (this.engine) await this.engine.destroy(); this.engine = null; }
}
