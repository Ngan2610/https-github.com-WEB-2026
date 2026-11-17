// Quy đổi đơn vị nấu ăn kiểu Mỹ sang hệ mét TRƯỚC khi dịch, để mô hình dịch chỉ phải giữ nguyên con số.
// Chỉ áp dụng khi lời thoại gốc là tiếng Anh. Không đoán đơn vị mơ hồ (T, t, c).
//   cup = 240 ml, tbsp = 15 ml, tsp = 5 ml, fl oz = 30 ml, oz = 28.35 g, lb = 453.6 g, °F -> °C
// Lưu ý: cup/tbsp/tsp quy ra ml (thể tích). Không tự đổi sang gram vì mỗi nguyên liệu có khối lượng riêng khác nhau.

const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const FRAC_CLASS = '[½¼¾⅓⅔⅛]';
const NUM = `(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+\\s*${FRAC_CLASS}|${FRAC_CLASS}|\\d+(?:\\.\\d+)?)`;

export function parseQuantity(raw) {
  const s = String(raw).trim();
  let m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : NaN;
  m = s.match(new RegExp(`^(\\d+)?\\s*(${FRAC_CLASS})$`));
  if (m) return (m[1] ? Number(m[1]) : 0) + FRACTIONS[m[2]];
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const UNIT = [
  { re: /^(?:fl\.?\s*oz|fluid\s+ounces?)$/i, kind: 'vol', factor: 30 },
  { re: /^(?:cups?)$/i, kind: 'vol', factor: 240 },
  { re: /^(?:tablespoons?|tbsps?)$/i, kind: 'vol', factor: 15 },
  { re: /^(?:teaspoons?|tsps?)$/i, kind: 'vol', factor: 5 },
  { re: /^(?:ounces?|oz)$/i, kind: 'mass', factor: 28.3495 },
  { re: /^(?:pounds?|lbs?)$/i, kind: 'mass', factor: 453.592 },
];

function formatVolume(ml) {
  if (ml >= 1000) return `${Number((ml / 1000).toFixed(2))} l`;
  if (ml < 10) return `${Number(ml.toFixed(1))} ml`;
  return `${Math.round(ml)} ml`;
}
function formatMass(g) {
  if (g >= 1000) return `${Number((g / 1000).toFixed(2))} kg`;
  return `${g >= 100 ? Math.round(g / 5) * 5 : Math.round(g)} g`;
}
const fmt = (kind, v) => (kind === 'vol' ? formatVolume(v) : formatMass(v));

const MEASURE = new RegExp(
  `(?<![\\w./])(?:(${NUM})\\s*(?:-|–|to)\\s*)?(${NUM})\\s*` +
  '(fl\\.?\\s*oz|fluid\\s+ounces?|cups?|tablespoons?|tbsps?|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?)(?![A-Za-z])', 'gi');
const TEMP = new RegExp(`(?<![\\w./])(${NUM})\\s*(?:°\\s*F|º\\s*F|degrees?\\s+F(?:ahrenheit)?)(?![A-Za-z])`, 'gi');

/** Trả về { text, conversions: [{from, to}] }. Chỉ đổi khi from === 'en'. */
export function convertUnits(text, { from = 'en' } = {}) {
  const input = String(text ?? '');
  if (from !== 'en') return { text: input, conversions: [] };
  const conversions = [];

  let out = input.replace(TEMP, (whole, raw) => {
    const f = parseQuantity(raw);
    if (!Number.isFinite(f)) return whole;
    const to = `${Math.round((f - 32) * 5 / 9)}°C`;
    conversions.push({ from: whole.trim(), to });
    return to;
  });

  out = out.replace(MEASURE, (whole, lo, hi, unitRaw) => {
    const unit = UNIT.find(u => u.re.test(unitRaw.replace(/\s+/g, ' ')));
    const high = parseQuantity(hi);
    const low = lo === undefined ? null : parseQuantity(lo);
    if (!unit || !Number.isFinite(high) || (low !== null && !Number.isFinite(low))) return whole;
    const to = low === null
      ? fmt(unit.kind, high * unit.factor)
      : `${fmt(unit.kind, low * unit.factor).replace(/ (ml|g|l|kg)$/, '')}–${fmt(unit.kind, high * unit.factor)}`;
    conversions.push({ from: whole.trim(), to });
    return to;
  });

  return { text: out, conversions };
}
