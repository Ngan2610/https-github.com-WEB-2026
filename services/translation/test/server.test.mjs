import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { TranslationError } from '../src/translate.js';

async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { await new Promise(r => server.close(r)); }
}
const post = (base, body, headers = {}) => fetch(`${base}/translate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('GET /health luôn sống, không cần Ollama', async () => {
  await withServer({ translate: async () => { throw new Error('no'); } }, async (base) => {
    const r = await fetch(`${base}/health`); assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, service: 'translation' });
  });
});
test('POST /translate trả kết quả và chuyển đúng tham số', async () => {
  let seen;
  await withServer({ translate: async (x) => { seen = x; return { translatedText: 'ok', conversions: [], glossary: [] }; } }, async (base) => {
    const r = await post(base, { text: 'hi', from: 'en', to: 'vi' });
    assert.equal(r.status, 200); assert.equal((await r.json()).translatedText, 'ok');
    assert.deepEqual(seen, { text: 'hi', from: 'en', to: 'vi' });
  });
});
test('mã lỗi HTTP: invalid 400, unavailable 503, timeout 502', async () => {
  for (const [code, status] of [['invalid', 400], ['unavailable', 503], ['model_missing', 503], ['timeout', 502]]) {
    await withServer({ translate: async () => { throw new TranslationError(code); } }, async (base) => {
      const r = await post(base, { text: 'x', from: 'en', to: 'vi' });
      assert.equal(r.status, status); assert.equal((await r.json()).code, code);
    });
  }
});
test('JSON hỏng hoặc quá lớn bị từ chối 400', async () => {
  await withServer({}, async (base) => {
    const bad = await fetch(`${base}/translate`, { method: 'POST', body: '{oops' });
    assert.equal(bad.status, 400);
  });
});
test('INTERNAL_TOKEN: thiếu hoặc sai bị 401, đúng thì qua; /health vẫn mở', async () => {
  await withServer({ internalToken: 's3cret', translate: async () => ({ translatedText: 'ok' }) }, async (base) => {
    assert.equal((await post(base, { text: 'a', from: 'en', to: 'vi' })).status, 401);
    assert.equal((await post(base, { text: 'a', from: 'en', to: 'vi' }, { 'X-Internal-Token': 'nope' })).status, 401);
    assert.equal((await post(base, { text: 'a', from: 'en', to: 'vi' }, { 'X-Internal-Token': 's3cret' })).status, 200);
    assert.equal((await fetch(`${base}/health`)).status, 200);
  });
});
test('GET /glossary và /health/model và 404', async () => {
  await withServer({ status: async () => ({ reachable: true, modelReady: false }) }, async (base) => {
    const g = await (await fetch(`${base}/glossary?from=en&to=vi`)).json();
    assert.ok(g.terms.some(t => t.source === 'fish sauce' && t.target === 'nước mắm'));
    assert.equal((await fetch(`${base}/health/model`)).status, 503);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
  });
});
