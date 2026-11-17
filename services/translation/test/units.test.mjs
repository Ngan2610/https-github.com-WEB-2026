import test from 'node:test';
import assert from 'node:assert/strict';
import { convertUnits, parseQuantity } from '../src/units.js';

const c = (s) => convertUnits(s).text;

test('nhiệt độ °F sang °C', () => {
  assert.equal(c('Bake at 350°F for 20 minutes.'), 'Bake at 177°C for 20 minutes.');
  assert.equal(c('Preheat to 400 degrees F.'), 'Preheat to 204°C.');
  assert.equal(c('Heat to 212 ° F'), 'Heat to 100°C');
});
test('thể tích: cup, tbsp, tsp, fl oz, kể cả phân số và số hỗn hợp', () => {
  assert.equal(c('Add 1 1/2 cups of flour'), 'Add 360 ml of flour');
  assert.equal(c('2 tbsp sugar'), '30 ml sugar');
  assert.equal(c('1/2 tsp salt'), '2.5 ml salt');
  assert.equal(c('1½ cups milk'), '360 ml milk');
  assert.equal(c('8 fl oz water'), '240 ml water');
  assert.equal(c('5 cups stock'), '1.2 l stock');
});
test('khối lượng: oz và lb', () => {
  assert.equal(c('8 oz chicken'), '225 g chicken');
  assert.equal(c('1 lb pork'), '455 g pork');
  assert.equal(c('3 pounds beef'), '1.36 kg beef');
});
test('khoảng giá trị 2-3 tbsp không bị đổi sai', () => {
  assert.equal(c('Mix 2-3 tbsp oil'), 'Mix 30–45 ml oil');
});
test('không đổi từ chứa tên đơn vị và không mất dấu chấm cuối câu', () => {
  assert.equal(c('I love cupcakes and the stoup.'), 'I love cupcakes and the stoup.');
  assert.equal(c('Add 1 tsp.'), 'Add 5 ml.');
});
test('chỉ đổi khi lời thoại gốc là tiếng Anh', () => {
  assert.deepEqual(convertUnits('2 cups', { from: 'vi' }), { text: '2 cups', conversions: [] });
});
test('trả về danh sách quy đổi để hiển thị', () => {
  const r = convertUnits('Use 2 cups at 350°F');
  assert.deepEqual(r.conversions.map(x => x.to).sort(), ['177°C', '480 ml']);
});
test('parseQuantity', () => {
  assert.equal(parseQuantity('1 1/2'), 1.5);
  assert.equal(parseQuantity('3/4'), 0.75);
  assert.equal(parseQuantity('½'), 0.5);
  assert.ok(Number.isNaN(parseQuantity('1/0')) || !Number.isFinite(parseQuantity('1/0')));
});
