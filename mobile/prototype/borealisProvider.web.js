export { BOREALIS_MODEL } from './borealisModel';

export async function getBorealisModelStatus() {
  return { installed: false, bytes: 0 };
}

export async function downloadBorealisModel() {
  throw new Error('The on-device Borealis model is available in native Android and iOS builds, not the browser version.');
}

export function cancelBorealisModelDownload() {}
export async function deleteBorealisModel() {}

export class LocalBorealisProvider {
  async reply() {
    throw new Error('The on-device Borealis model is available in native Android and iOS builds, not the browser version.');
  }

  async release() {}
}
