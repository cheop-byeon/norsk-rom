const commonWords = {
  hva: 'what', hvor: 'where', hvem: 'who', hvordan: 'how', hvorfor: 'why',
  jeg: 'I', du: 'you', han: 'he', hun: 'she', vi: 'we', de: 'they',
  er: 'am / is / are', har: 'have / has', vil: 'want / will', kan: 'can',
  skal: 'will / shall', ikke: 'not', med: 'with / to go', her: 'here', der: 'there',
  takk: 'thanks', gjerne: 'gladly / would like to', kaffe: 'coffee', koster: 'costs',
  kroner: 'kroner', eller: 'or', en: 'a / an', et: 'a / an', den: 'it / that',
  det: 'it / that', på: 'on / at', til: 'to', fra: 'from', ta: 'take',
  havremelk: 'oat milk', betale: 'pay', kort: 'card', sitte: 'sit',
};

export function splitSentences(text) {
  const protectedText = String(text)
    .replace(/(\d)\.(?=\d)/gu, '$1§')
    .replace(/\b(f|eks|ca|kl|nr|bl|osv|etc)\./giu, '$1§');
  return (protectedText.match(/[^.!?]+[.!?]+|[^.!?]+$/gu) || [])
    .map(sentence => sentence.replace(/§/gu, '.'))
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

export function wordTokens(text) {
  return String(text).match(/[\p{L}\p{M}]+(?:[’'-][\p{L}\p{M}]+)*/gu) || [];
}

export function wordMeaning(word, phrases = []) {
  const normalized = String(word).toLocaleLowerCase('nb-NO');
  const phrase = phrases.find(item => wordTokens(item.text).some(token => token.toLocaleLowerCase('nb-NO') === normalized));
  if (phrase) return { meaning: phrase.meaning, phrase: phrase.text, source: 'lesson expression' };
  const meaning = commonWords[normalized];
  return meaning ? { meaning, phrase: null, source: 'starter glossary' } : null;
}
