import test from 'node:test';
import assert from 'node:assert/strict';
import { localTranslate } from '../src/localTranslate.js';
test('Ollama receives glossary hints for culinary subtitles without changing source', async () => {
  let request;
  const result = await localTranslate('Áp chảo cá với sả', 'vi', 'en', {
    fetchImpl: async (_url, options) => { request = JSON.parse(options.body); return { ok: true, json: async () => ({ response: 'Pan-sear fish with lemongrass' }) }; },
  });
  assert.equal(result, 'Pan-sear fish with lemongrass');
  assert.match(request.prompt, /pan-sear/);
  assert.match(request.prompt, /Áp chảo cá với sả/);
  assert.equal(request.options.temperature, 0);
});
