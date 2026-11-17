import test from 'node:test';
import assert from 'node:assert/strict';
import { translateCooking, buildPrompt, modelStatus } from '../src/translate.js';

const okFetch = (capture) => async (url, options) => {
  capture.url = url; capture.body = JSON.parse(options.body);
  return { ok: true, json: async () => ({ response: ' Nướng ở 177°C. ' }) };
};

test('đơn vị được quy đổi và thuật ngữ được đưa vào prompt trước khi gọi Ollama', async () => {
  const cap = {};
  const r = await translateCooking({ text: 'Bake 2 cups of rice with fish sauce at 350°F.', from: 'en', to: 'vi' }, { fetchImpl: okFetch(cap), endpoint: 'http://ollama:11434/' });
  assert.equal(cap.url, 'http://ollama:11434/api/generate');
  assert.match(cap.body.prompt, /480 ml of rice/);
  assert.match(cap.body.prompt, /177°C/);
  assert.match(cap.body.prompt, /"fish sauce" => "nước mắm"/);
  assert.match(cap.body.prompt, /"Bake" => "nướng"/);
  assert.equal(r.translatedText, 'Nướng ở 177°C.');
  assert.equal(r.conversions.length, 2);
  assert.ok(r.glossary.some(g => g.target === 'nước mắm'));
});
test('cùng ngôn ngữ trả nguyên văn, không gọi Ollama', async () => {
  const r = await translateCooking({ text: 'abc', from: 'vi', to: 'vi' }, { fetchImpl: () => { throw new Error('không được gọi'); } });
  assert.equal(r.translatedText, 'abc');
});
test('tham số không hợp lệ bị từ chối', async () => {
  for (const bad of [{ text: '', from: 'en', to: 'vi' }, { text: 'x', from: 'fr', to: 'vi' }, { text: 'x'.repeat(4001), from: 'en', to: 'vi' }])
    await assert.rejects(translateCooking(bad, { fetchImpl: () => { throw new Error('no'); } }), { code: 'invalid' });
});
test('ánh xạ lỗi Ollama: 404 model_missing, 500 server, rỗng empty, mạng unavailable', async () => {
  const mk = (status, body) => async () => ({ ok: status < 400, status, json: async () => body });
  const run = (f) => translateCooking({ text: 'garlic', from: 'en', to: 'vi' }, { fetchImpl: f });
  await assert.rejects(run(mk(404, {})), { code: 'model_missing' });
  await assert.rejects(run(mk(500, {})), { code: 'server' });
  await assert.rejects(run(mk(200, { response: '  ' })), { code: 'empty' });
  await assert.rejects(run(async () => { throw new Error('ECONNREFUSED'); }), { code: 'unavailable' });
});
test('timeout được báo là timeout', async () => {
  const slow = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))));
  await assert.rejects(translateCooking({ text: 'garlic', from: 'en', to: 'vi' }, { fetchImpl: slow, timeoutMs: 20 }), { code: 'timeout' });
});
test('prompt không có mục thuật ngữ khi không khớp', () => {
  assert.doesNotMatch(buildPrompt({ text: 'hello', from: 'en', to: 'vi', terms: [] }), /terminology/);
});
test('trạng thái model', async () => {
  assert.deepEqual(await modelStatus({ fetchImpl: async () => ({ ok: true, json: async () => ({ models: [{ name: 'qwen2.5:3b' }] }) }) }), { reachable: true, modelReady: true });
  assert.deepEqual(await modelStatus({ fetchImpl: async () => { throw new Error('x'); } }), { reachable: false, modelReady: false });
});
