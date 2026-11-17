// Pipeline dịch phụ đề video nấu ăn: quy đổi đơn vị -> tìm thuật ngữ -> hỏi Ollama -> trả kết quả.
import { convertUnits } from './units.js';
import { findTerms } from './glossary.js';

const LANG = { vi: 'Vietnamese', en: 'English', zh: 'Simplified Chinese' };
export class TranslationError extends Error { constructor(code) { super(code); this.name = 'TranslationError'; this.code = code; } }

export const MAX_TEXT = 4000;

export function buildPrompt({ text, from, to, terms }) {
  const glossary = terms.length
    ? `\nMandatory terminology (use exactly these translations):\n${terms.map(t => `- "${t.source}" => "${t.target}"`).join('\n')}\n`
    : '';
  return `Translate the following cooking-video subtitle from ${LANG[from]} to ${LANG[to]}. ` +
    'Keep every number, quantity and unit exactly as written (they are already converted). ' +
    `Do not translate dish names that are proper names.${glossary}` +
    'Return only the translated subtitle, no explanations or quotes.\n\nSUBTITLE:\n' + text;
}

export async function translateCooking({ text, from, to }, {
  endpoint = process.env.OLLAMA_URL || 'http://ollama:11434',
  model = process.env.OLLAMA_MODEL || 'qwen2.5:3b',
  fetchImpl = fetch, timeoutMs = 120000,
} = {}) {
  if (!LANG[from] || !LANG[to]) throw new TranslationError('invalid');
  const input = String(text ?? '').trim();
  if (!input || input.length > MAX_TEXT) throw new TranslationError('invalid');
  if (from === to) return { translatedText: input, conversions: [], glossary: [] };

  const converted = convertUnits(input, { from });
  const terms = findTerms(converted.text, from, to);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${endpoint.replace(/\/$/, '')}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({ model, stream: false, options: { temperature: 0 },
        prompt: buildPrompt({ text: converted.text, from, to, terms }) }),
    });
    if (!response.ok) throw new TranslationError(response.status === 404 ? 'model_missing' : 'server');
    const data = await response.json();
    const output = String(data.response || '').trim();
    if (!output) throw new TranslationError('empty');
    return { translatedText: output, conversions: converted.conversions, glossary: terms };
  } catch (err) {
    if (err instanceof TranslationError) throw err;
    throw new TranslationError(err.name === 'AbortError' ? 'timeout' : 'unavailable');
  } finally { clearTimeout(timer); }
}

export async function modelStatus({
  endpoint = process.env.OLLAMA_URL || 'http://ollama:11434',
  model = process.env.OLLAMA_MODEL || 'qwen2.5:3b', fetchImpl = fetch,
} = {}) {
  try {
    const r = await fetchImpl(`${endpoint.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return { reachable: false, modelReady: false };
    const body = await r.json();
    const ready = Array.isArray(body.models) && body.models.some(m => m.name === model || m.model === model);
    return { reachable: true, modelReady: Boolean(ready) };
  } catch { return { reachable: false, modelReady: false }; }
}
