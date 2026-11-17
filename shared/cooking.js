/** Glossary hints for Vietnamese cooking subtitles. Non-destructive: never rewrites user text. */
export const COOKING_GLOSSARY = Object.freeze([
  { vi: 'xào', en: 'stir-fry', zh: '炒' },
  { vi: 'hầm', en: 'stew / simmer slowly', zh: '炖' },
  { vi: 'áp chảo', en: 'pan-sear', zh: '煎' },
  { vi: 'om', en: 'braise', zh: '焖' },
  { vi: 'nước mắm', en: 'fish sauce', zh: '鱼露' },
  { vi: 'sả', en: 'lemongrass', zh: '香茅' },
  { vi: 'thìa canh', en: 'tablespoon (tbsp)', zh: '汤匙' },
  { vi: 'thìa cà phê', en: 'teaspoon (tsp)', zh: '茶匙' },
]);

/** Only terms present in a subtitle are sent as translation guidance. */
export function cookingTermsIn(text) {
  const source = String(text || '').toLocaleLowerCase('vi');
  return COOKING_GLOSSARY.filter(row => source.includes(row.vi));
}

/** Exact unit equivalences where the ingredient density is irrelevant. */
export function convertCookingMeasure(value, from, to) {
  if (!Number.isFinite(value)) throw new TypeError('value must be finite');
  const volumeMl = { ml: 1, l: 1000, tsp: 5, tbsp: 15, cup: 240 };
  const massG = { g: 1, kg: 1000, oz: 28.349523125 };
  if (from === 'F' && to === 'C') return (value - 32) * 5 / 9;
  if (from === 'C' && to === 'F') return value * 9 / 5 + 32;
  for (const units of [volumeMl, massG]) {
    if (Object.hasOwn(units, from) && Object.hasOwn(units, to)) return value * units[from] / units[to];
  }
  throw new RangeError('incompatible or unsupported cooking units; mass-to-volume requires ingredient density');
}
