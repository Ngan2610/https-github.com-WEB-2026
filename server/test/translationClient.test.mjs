import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemoteTranslator, createTranslator } from '../src/translationClient.js';

const json = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });

test('gọi microservice, gửi token nội bộ và nhận bản dịch', async () => {
  let seen;
  const t = createRemoteTranslator({ baseUrl: 'http://translation:4100/', token: 'tok', fetchImpl: async (url, o) => { seen = { url, o }; return { ok: true, json: async () => ({ translatedText: ' Xin chào ' }) }; } });
  assert.equal(await t.translate('Hello', 'en', 'vi'), 'Xin chào');
  assert.equal(seen.url, 'http://translation:4100/translate');
  assert.equal(seen.o.headers['X-Internal-Token'], 'tok');
  assert.deepEqual(JSON.parse(seen.o.body), { text: 'Hello', from: 'en', to: 'vi' });
});
test('ánh xạ mã lỗi từ microservice', async () => {
  for (const code of ['model_missing', 'timeout', 'unavailable', 'empty']) {
    const t = createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: json(503, { code }) });
    await assert.rejects(t.translate('a', 'en', 'vi'), { code });
  }
  await assert.rejects(createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: json(500, { code: 'weird' }) }).translate('a', 'en', 'vi'), { code: 'server' });
  await assert.rejects(createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: json(200, { translatedText: '' }) }).translate('a', 'en', 'vi'), { code: 'empty' });
});
test('mất kết nối tới microservice -> unavailable; quá hạn -> timeout', async () => {
  await assert.rejects(createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } }).translate('a', 'en', 'vi'), { code: 'unavailable' });
  await assert.rejects(createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: async () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); } }).translate('a', 'en', 'vi'), { code: 'timeout' });
});
test('status phản ánh /health/model', async () => {
  assert.deepEqual(await createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: json(200, { reachable: true, modelReady: true }) }).status(), { reachable: true, modelReady: true });
  assert.deepEqual(await createRemoteTranslator({ baseUrl: 'http://x', fetchImpl: async () => { throw new Error('x'); } }).status(), { reachable: false, modelReady: false });
});
test('createTranslator chọn chế độ theo biến môi trường', () => {
  assert.equal(createTranslator({}).mode, 'direct');
  assert.equal(createTranslator({ TRANSLATION_SERVICE_URL: 'http://translation:4100' }).mode, 'service');
});
