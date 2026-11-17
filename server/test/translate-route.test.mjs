import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword } from '../src/auth.js';
import { createApp } from '../src/app.js';

// Kiểm tra route /api/translate đi qua bộ dịch được tiêm vào (microservice hoặc Ollama trực tiếp).
const users = [{ name: 'A', email: 'a@x.vn', role: 'user', status: 'active', at: new Date().toISOString(), hash: hashPassword('password123') }];
const repo = { findUser: async (e) => users.find(u => u.email === e) || null, addVisit: async () => {} };

async function boot(translator) {
  const server = createApp(repo, { secret: 's', translator }).listen(0);
  const base = `http://localhost:${server.address().port}`;
  const login = await (await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a@x.vn', password: 'password123' }) })).json();
  const call = async (path, body) => { const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.user.token}` }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, data: await r.json() }; };
  return { call, close: () => server.close() };
}

test('/api/translate dùng bộ dịch được cấu hình và trả translatedText', async () => {
  let seen;
  const app = await boot({ translate: async (...a) => { seen = a; return 'Xin chào'; }, status: async () => ({ reachable: true, modelReady: true }) });
  try {
    const r = await app.call('/api/translate', { text: 'Hello', from: 'en', to: 'vi' });
    assert.equal(r.status, 200); assert.equal(r.data.translatedText, 'Xin chào');
    assert.deepEqual(seen, ['Hello', 'en', 'vi']);
    assert.equal((await app.call('/api/health/translation')).status, 200);
  } finally { app.close(); }
});
test('lỗi từ bộ dịch được ánh xạ thành 503/502 và không lộ chi tiết', async () => {
  for (const [code, status] of [['unavailable', 503], ['model_missing', 503], ['timeout', 502], ['weird', 502]]) {
    const app = await boot({ translate: async () => { throw Object.assign(new Error('secret detail'), { code }); }, status: async () => ({ reachable: false, modelReady: false }) });
    try {
      const r = await app.call('/api/translate', { text: 'Hello', from: 'en', to: 'vi' });
      assert.equal(r.status, status); assert.ok(!JSON.stringify(r.data).includes('secret detail'));
      assert.equal((await app.call('/api/health/translation')).status, 503);
    } finally { app.close(); }
  }
});
test('ngôn ngữ ngoài vi/en/zh bị từ chối 400 trước khi gọi bộ dịch', async () => {
  const app = await boot({ translate: async () => { throw new Error('không được gọi'); }, status: async () => ({}) });
  try { assert.equal((await app.call('/api/translate', { text: 'Hello', from: 'en', to: 'fr' })).status, 400); } finally { app.close(); }
});
