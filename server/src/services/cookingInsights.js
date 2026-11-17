import { findTerms } from '../../../services/translation/src/glossary.js';
import { convertUnits } from '../../../services/translation/src/units.js';
const ACTIONS = /(?:xào|hầm|đun|nấu|thái|cắt|băm|trộn|ướp|chiên|nướng|hấp|áp chảo|cho vào|thêm|stir|heat|add|mix|chop|slice|bake|cook|fry|simmer|boil|steam|炒|煮|切|加入|搅拌|蒸|烤)/iu;
const INGREDIENTS = /(?:nước mắm|nước tương|thịt|cá|gà|tỏi|sả|gừng|muối|đường|bột|dầu|trứng|hành|ớt|rau|fish sauce|soy sauce|chicken|fish|pork|garlic|ginger|salt|sugar|flour|oil|egg|onion|water|milk|rice|pepper|鱼|肉|鸡|蒜|盐|糖|油|蛋|米|水|奶)/giu;
export function cookingInsights(lines, language = 'vi') {
  const glossary = [], conversions = [], ingredients = [], steps = [];
  const seen = new Set();
  for (const row of lines || []) {
    if (typeof row?.text !== 'string') continue;
    for (const to of ['vi','en','zh'].filter(x => x !== language)) {
      for (const term of findTerms(row.text, language, to)) {
        const key = `${term.source.toLowerCase()}:${to}`;
        if (!seen.has(key)) { seen.add(key); glossary.push({...term, language:to}); }
      }
    }
    conversions.push(...convertUnits(row.text, {from:language}).conversions);
    const names = [...row.text.matchAll(INGREDIENTS)].map(m => m[0]);
    for (const name of new Set(names)) {
      if (!ingredients.some(x => x.name.toLowerCase() === name.toLowerCase()))
        ingredients.push({name, evidence:row.text, start:row.start ?? null});
    }
    if (ACTIONS.test(row.text)) steps.push({text:row.text,start:row.start ?? null,end:row.end ?? null});
  }
  return {language, glossary, conversions:[...new Map(conversions.map(x => [x.from+'='+x.to,x])).values()],
    ingredients, steps, method:'rules', note:'Trích từ lời thoại; kiểm tra lại công thức và lượng nguyên liệu trước khi dùng.'};
}
