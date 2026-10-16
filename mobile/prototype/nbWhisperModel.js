export const NB_WHISPER_MODEL = {
  name: 'NB-Whisper Large q5_0',
  revision: '78cb1b6fd47d697cdd7f3106d64138a0009c5b76',
  sizeBytes: 1081140203,
  sha256: 'feb5951ae694a62cfeb81fb501f6cfa8cc50d96bcddb1e4e8215f7006bac23a2',
  xetEtag: '911c8d38dfe1c8ef6ce1810a8f0c5ba154a60160435e7effc799c28d653c16d1',
  url: 'https://huggingface.co/NbAiLab/nb-whisper-large/resolve/78cb1b6fd47d697cdd7f3106d64138a0009c5b76/ggml-model-q5_0.bin',
};

export function matchesPublishedNbModel({ size, etag, sha256 }) {
  if (Number(size) !== NB_WHISPER_MODEL.sizeBytes) return false;
  if (sha256 !== undefined) return String(sha256).toLowerCase() === NB_WHISPER_MODEL.sha256;
  return !etag || String(etag).replace(/"/g, '') === NB_WHISPER_MODEL.xetEtag;
}
