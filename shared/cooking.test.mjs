import test from 'node:test';
import assert from 'node:assert/strict';
import { cookingTermsIn, convertCookingMeasure } from './cooking.js';
test('glossary only includes mentioned Vietnamese culinary terms', () => {
  const terms = cookingTermsIn('Áp chảo gà với sả, sau đó hầm');
  assert.deepEqual(terms.map(row => row.vi), ['hầm', 'áp chảo', 'sả']);
  assert.deepEqual(cookingTermsIn('boil water'), []);
});
test('safe mass, volume and temperature conversions', () => {
  assert.equal(convertCookingMeasure(2, 'tbsp', 'ml'), 30);
  assert.equal(convertCookingMeasure(1, 'cup', 'ml'), 240);
  assert.ok(Math.abs(convertCookingMeasure(1, 'oz', 'g') - 28.3495) < .001);
  assert.equal(convertCookingMeasure(212, 'F', 'C'), 100);
  assert.throws(() => convertCookingMeasure(1, 'cup', 'g'), /density/);
});
