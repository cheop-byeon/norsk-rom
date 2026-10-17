export const PIPER_VOICE = { name: 'Piper Norwegian voice', modelId: 'piper-no-no' };
export async function getPiperStatus() { return { installed: false }; }
export async function downloadPiperVoice() { throw new Error('Piper neural speech is available in installed Android and iOS builds.'); }
export function cancelPiperDownload() {}
export class LocalPiperProvider {
  async speak() { throw new Error('Piper neural speech is available in installed Android and iOS builds.'); }
  stop() {}
  async release() {}
}
