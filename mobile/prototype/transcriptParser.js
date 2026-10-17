export function cleanTranscript(text, filename = '') {
  const ext = String(filename).split('.').pop()?.toLowerCase();
  let value = String(text ?? '').replace(/^\uFEFF/, '');
  if (ext === 'vtt' || ext === 'srt' || /WEBVTT|-->/.test(value)) {
    value = value.split(/\r?\n/).filter(line => {
      const item = line.trim();
      return item && item !== 'WEBVTT' && !/^\d+$/.test(item) && !/^\d{2}:\d{2}/.test(item) && !/^NOTE(?:\s|$)/.test(item);
    }).join(' ');
  }
  return value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export function splitTranscript(text, maxLines = 30) {
  return String(text ?? '').match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(line => line.trim()).filter(Boolean).slice(0, maxLines) ?? [];
}
