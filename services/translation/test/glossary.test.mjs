import test from 'node:test';
import assert from 'node:assert/strict';
import { findTerms, listGlossary, GLOSSARY } from '../src/glossary.js';

test('nhận diện thuật ngữ EN -> VI, cụm dài thắng cụm ngắn', () => {
  const t = findTerms('Saute the garlic, then stir-fry with soy sauce and fish sauce.', 'en', 'vi');
  assert.deepEqual(t.map(x => x.target), ['xào', 'tỏi', 'xào', 'nước tương', 'nước mắm']);
});
test('VI -> EN và ZH -> EN', () => {
  assert.deepEqual(findTerms('Xào tỏi với nước mắm', 'vi', 'en').map(x => x.target), ['sauté', 'garlic', 'fish sauce']);
  assert.deepEqual(findTerms('先炒大蒜，再加鱼露。', 'zh', 'en').map(x => x.target), ['sauté', 'garlic', 'fish sauce']);
});
test('không khớp giữa từ (ginger-garlic ok, "sauces" không khớp "sauce" riêng lẻ)', () => {
  assert.deepEqual(findTerms('The grillers love it', 'en', 'vi'), []);
});
test('cùng ngôn ngữ hoặc ngôn ngữ lạ trả về rỗng', () => {
  assert.deepEqual(findTerms('garlic', 'en', 'en'), []);
  assert.deepEqual(findTerms('garlic', 'en', 'fr'), []);
});
test('mọi mục từ điển đủ 3 ngôn ngữ và không trùng nghĩa chuẩn EN', () => {
  const primary = new Set();
  for (const e of GLOSSARY) {
    assert.ok(e.en?.[0] && e.vi?.[0] && e.zh?.[0], JSON.stringify(e));
    assert.ok(!primary.has(e.en[0]), `trùng ${e.en[0]}`); primary.add(e.en[0]);
  }
  assert.ok(listGlossary('en', 'vi').length >= 40);
});
