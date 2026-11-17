// Từ điển thuật ngữ ẩm thực EN/VI/ZH. Phần tử đầu tiên của mỗi mảng là cách dịch chuẩn.
// Các alias phía sau chỉ dùng để NHẬN DIỆN thuật ngữ trong câu gốc.
// Lưu ý: nhóm nên nhờ người bản ngữ rà soát lại, đặc biệt tiếng Trung và từ vùng miền (Nam/Bắc).
export const GLOSSARY = [
  // Kỹ thuật nấu
  { en: ['sauté', 'saute', 'sautéing', 'sauteing'], vi: ['xào'], zh: ['炒'] },
  { en: ['stir-fry', 'stir fry'], vi: ['xào'], zh: ['炒'] },
  { en: ['simmer'], vi: ['đun nhỏ lửa', 'ninh'], zh: ['小火慢煮'] },
  { en: ['braise'], vi: ['om'], zh: ['焖'] },
  { en: ['stew'], vi: ['hầm'], zh: ['炖'] },
  { en: ['sear'], vi: ['áp chảo'], zh: ['煎封'] },
  { en: ['pan-fry', 'pan fry'], vi: ['chiên'], zh: ['煎'] },
  { en: ['deep-fry', 'deep fry'], vi: ['chiên ngập dầu'], zh: ['油炸'] },
  { en: ['blanch'], vi: ['chần'], zh: ['焯水'] },
  { en: ['steam'], vi: ['hấp'], zh: ['蒸'] },
  { en: ['grill'], vi: ['nướng'], zh: ['烧烤'] },
  { en: ['roast'], vi: ['nướng lò'], zh: ['烤'] },
  { en: ['bake'], vi: ['nướng'], zh: ['烘焙'] },
  { en: ['marinate'], vi: ['ướp'], zh: ['腌制'] },
  { en: ['dice'], vi: ['thái hạt lựu'], zh: ['切丁'] },
  { en: ['mince'], vi: ['băm'], zh: ['剁碎'] },
  { en: ['julienne'], vi: ['thái sợi'], zh: ['切丝'] },
  { en: ['whisk'], vi: ['đánh'], zh: ['搅打'] },
  { en: ['fold in'], vi: ['trộn nhẹ tay'], zh: ['翻拌'] },
  { en: ['knead'], vi: ['nhào'], zh: ['揉'] },
  // Nguyên liệu, gia vị
  { en: ['fish sauce'], vi: ['nước mắm'], zh: ['鱼露'] },
  { en: ['soy sauce'], vi: ['nước tương'], zh: ['酱油'] },
  { en: ['oyster sauce'], vi: ['dầu hào'], zh: ['蚝油'] },
  { en: ['sesame oil'], vi: ['dầu mè'], zh: ['芝麻油'] },
  { en: ['scallion', 'scallions', 'green onion', 'green onions', 'spring onion', 'spring onions'], vi: ['hành lá'], zh: ['葱'] },
  { en: ['shallot', 'shallots'], vi: ['hành tím'], zh: ['红葱头'] },
  { en: ['cilantro', 'coriander'], vi: ['rau mùi'], zh: ['香菜'] },
  { en: ['lemongrass'], vi: ['sả'], zh: ['香茅'] },
  { en: ['garlic'], vi: ['tỏi'], zh: ['大蒜'] },
  { en: ['ginger'], vi: ['gừng'], zh: ['姜'] },
  { en: ['chili pepper', 'chili peppers', 'chilli'], vi: ['ớt'], zh: ['辣椒'] },
  { en: ['tofu'], vi: ['đậu phụ'], zh: ['豆腐'] },
  { en: ['bok choy'], vi: ['cải thìa'], zh: ['小白菜'] },
  { en: ['eggplant'], vi: ['cà tím'], zh: ['茄子'] },
  { en: ['pork belly'], vi: ['thịt ba chỉ'], zh: ['五花肉'] },
  { en: ['rice paper'], vi: ['bánh tráng'], zh: ['米纸'] },
  { en: ['cornstarch', 'corn starch'], vi: ['bột bắp'], zh: ['玉米淀粉'] },
  { en: ['all-purpose flour'], vi: ['bột mì đa dụng'], zh: ['中筋面粉'] },
  { en: ['baking powder'], vi: ['bột nở'], zh: ['泡打粉'] },
  { en: ['baking soda'], vi: ['muối nở'], zh: ['小苏打'] },
  { en: ['heavy cream'], vi: ['kem tươi'], zh: ['淡奶油'] },
  { en: ['brown sugar'], vi: ['đường nâu'], zh: ['红糖'] },
];

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function candidates(from, to) {
  const list = [];
  for (const entry of GLOSSARY) {
    const target = entry[to]?.[0];
    if (!target || !entry[from]) continue;
    for (const alias of entry[from]) list.push({ source: alias, target });
  }
  // Cụm dài trước để "stir-fry" không bị tách thành "fry"; "soy sauce" thắng "sauce".
  return list.sort((a, b) => b.source.length - a.source.length);
}

/** Tìm các thuật ngữ có trong câu gốc. Trả về [{source, target}] không trùng lặp, theo thứ tự xuất hiện. */
export function findTerms(text, from, to) {
  if (!['en', 'vi', 'zh'].includes(from) || !['en', 'vi', 'zh'].includes(to) || from === to) return [];
  const input = String(text ?? '');
  const taken = [];
  const found = [];
  for (const { source, target } of candidates(from, to)) {
    // Tiếng Trung không có khoảng trắng giữa từ nên không kiểm tra ranh giới từ.
    const re = from === 'zh'
      ? new RegExp(esc(source), 'gu')
      : new RegExp(`(?<![\\p{L}\\p{N}])${esc(source)}(?![\\p{L}\\p{N}])`, 'giu');
    for (const m of input.matchAll(re)) {
      const start = m.index; const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      found.push({ at: start, source: m[0], target });
    }
  }
  found.sort((a, b) => a.at - b.at);
  const seen = new Set();
  return found.filter(({ source, target }) => {
    const key = `${source.toLowerCase()}→${target}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(({ source, target }) => ({ source, target }));
}

export function listGlossary(from, to) {
  return GLOSSARY.filter(e => e[from] && e[to]).map(e => ({ source: e[from][0], target: e[to][0] }));
}
