import RNFS from 'react-native-fs';
import { initLlama } from 'llama.rn';

import { BOREALIS_MODEL } from './borealisModel';
export { BOREALIS_MODEL } from './borealisModel';

const directory = `${RNFS.DocumentDirectoryPath}/NorskRomModels`;
const modelPath = `${directory}/${BOREALIS_MODEL.file}`;
const partialPath = `${modelPath}.download`;
let activeDownloadJob = null;

export async function getBorealisModelStatus() {
  await RNFS.mkdir(directory, { NSURLIsExcludedFromBackupKey: true });
  if (!(await RNFS.exists(modelPath))) return { installed: false, bytes: 0 };
  const { size } = await RNFS.stat(modelPath);
  if (Number(size) !== BOREALIS_MODEL.sizeBytes) {
    await RNFS.unlink(modelPath);
    return { installed: false, bytes: 0, invalid: true };
  }
  return { installed: true, bytes: Number(size) };
}

export async function downloadBorealisModel(onProgress = () => {}) {
  const { freeSpace } = await RNFS.getFSInfo();
  const reserve = 400 * 1024 * 1024;
  if (Number(freeSpace) < BOREALIS_MODEL.sizeBytes + reserve) {
    throw new Error('Free at least 1.2 GB on this device before downloading Borealis.');
  }
  await RNFS.mkdir(directory, { NSURLIsExcludedFromBackupKey: true });
  if (await RNFS.exists(partialPath)) await RNFS.unlink(partialPath);
  let headerError = null;
  const task = RNFS.downloadFile({
    fromUrl: BOREALIS_MODEL.url,
    toFile: partialPath,
    cacheable: false,
    connectionTimeout: 30000,
    readTimeout: 120000,
    progressDivider: 1,
    begin: ({ jobId, statusCode, contentLength }) => {
      if (statusCode < 200 || statusCode >= 300) headerError = new Error(`Model download returned HTTP ${statusCode}.`);
      else if (contentLength > 0 && contentLength !== BOREALIS_MODEL.sizeBytes) headerError = new Error('The published model size changed; download stopped for safety.');
      if (headerError) {
        onProgress({ error: headerError.message });
        RNFS.stopDownload(jobId);
      }
    },
    progress: ({ bytesWritten, contentLength }) => onProgress({
      bytesWritten,
      contentLength: contentLength || BOREALIS_MODEL.sizeBytes,
      fraction: Math.min(bytesWritten / (contentLength || BOREALIS_MODEL.sizeBytes), 1),
    }),
  });
  activeDownloadJob = task.jobId;
  try {
    const result = await task.promise;
    if (headerError) throw headerError;
    if (result.statusCode < 200 || result.statusCode >= 300) throw new Error(`Model download returned HTTP ${result.statusCode}.`);
    const file = await RNFS.stat(partialPath);
    if (Number(file.size) !== BOREALIS_MODEL.sizeBytes) throw new Error('The downloaded model has the wrong size; the partial file was removed.');
    const sha256 = await RNFS.hash(partialPath, 'sha256');
    if (sha256.toLowerCase() !== BOREALIS_MODEL.sha256) throw new Error('The model failed its SHA-256 integrity check; the partial file was removed.');
    if (await RNFS.exists(modelPath)) await RNFS.unlink(modelPath);
    await RNFS.moveFile(partialPath, modelPath);
    return { path: modelPath, bytes: Number(file.size) };
  } catch (error) {
    if (await RNFS.exists(partialPath)) await RNFS.unlink(partialPath).catch(() => {});
    throw error;
  } finally {
    activeDownloadJob = null;
  }
}

export function cancelBorealisModelDownload() {
  if (activeDownloadJob !== null) RNFS.stopDownload(activeDownloadJob);
}

export async function deleteBorealisModel() {
  if (await RNFS.exists(modelPath)) await RNFS.unlink(modelPath);
}

export class LocalBorealisProvider {
  context = null;

  async load() {
    if (this.context) return;
    const status = await getBorealisModelStatus();
    if (!status.installed) throw new Error('Download Borealis on this device before starting an AI role-play.');
    this.context = await initLlama({
      model: `file://${modelPath}`,
      n_ctx: 2048,
      n_batch: 256,
      n_gpu_layers: 99,
      use_mlock: false,
    });
  }

  async reply({ scenario, level, history, learnerText }) {
    await this.load();
    const messages = [
      {
        role: 'system',
        content: `Du er en varm, tålmodig samtalepartner i Norsk Rom. Snakk naturlig og enkelt bokmål på nivå ${level}. Rollespill: ${scenario}. Hold deg til rollen. Svar kort med én eller to setninger, og still vanligvis ett relevant oppfølgingsspørsmål. Bruk teksten eleven sannsynligvis mente dersom den inneholder gjenkjenningsfeil; ikke gjenta den ordrett. Hvis meningen er uklar, be vennlig om en presisering. Rett én viktig grammatikkfeil diskret ved å bruke korrekt norsk i svaret. Ikke finn på hva eleven har sagt. Ikke gi engelsk oversettelse med mindre eleven spør.`,
      },
      ...history.slice(-8),
      { role: 'user', content: learnerText },
    ];
    const result = await this.context.completion({
      messages,
      n_predict: 120,
      temperature: 0.55,
      top_p: 0.85,
      stop: ['<|end_of_turn|>', '<|end_of_text|>', '<|eot_id|>'],
    });
    const text = result.text?.trim();
    if (!text) throw new Error('Borealis did not return a reply. Try again or type a shorter sentence.');
    return text;
  }

  async release() {
    if (this.context) await this.context.release().catch(() => {});
    this.context = null;
  }
}
