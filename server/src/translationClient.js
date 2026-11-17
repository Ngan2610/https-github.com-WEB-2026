// Chọn bộ dịch: gọi microservice `translation` qua HTTP khi có TRANSLATION_SERVICE_URL,
// ngược lại dùng Ollama trực tiếp (chế độ cũ, giữ để chạy đơn lẻ và để test không phụ thuộc mạng).
import { localTranslate, getOllamaStatus, LocalTranslationError } from './localTranslate.js';

export function createRemoteTranslator({ baseUrl, token = '', fetchImpl = fetch, timeoutMs = 125000 }) {
  const base = String(baseUrl).replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json', ...(token ? { 'X-Internal-Token': token } : {}) };
  return {
    mode: 'service',
    async translate(text, from, to) {
      let response;
      try {
        response = await fetchImpl(`${base}/translate`, {
          method: 'POST', headers, body: JSON.stringify({ text, from, to }), signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        throw new LocalTranslationError(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'unavailable');
      }
      let data = null;
      try { data = await response.json(); } catch { /* xử lý bên dưới */ }
      if (!response.ok) {
        const code = String(data?.code || '');
        throw new LocalTranslationError(['model_missing', 'timeout', 'unavailable', 'empty', 'invalid'].includes(code) ? code : 'server');
      }
      const out = typeof data?.translatedText === 'string' ? data.translatedText.trim() : '';
      if (!out) throw new LocalTranslationError('empty');
      return out;
    },
    async status() {
      try {
        const r = await fetchImpl(`${base}/health/model`, { headers, signal: AbortSignal.timeout(3000) });
        const body = await r.json().catch(() => ({}));
        return { reachable: Boolean(body.reachable), modelReady: Boolean(body.modelReady) };
      } catch { return { reachable: false, modelReady: false }; }
    },
  };
}

export function createTranslator(env = process.env, deps = {}) {
  if (env.TRANSLATION_SERVICE_URL) {
    return createRemoteTranslator({ baseUrl: env.TRANSLATION_SERVICE_URL, token: env.TRANSLATION_INTERNAL_TOKEN || '', ...deps });
  }
  return { mode: 'direct', translate: (t, f, to) => localTranslate(t, f, to), status: () => getOllamaStatus() };
}
