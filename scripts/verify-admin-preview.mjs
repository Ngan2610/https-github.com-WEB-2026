import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scan = (dir) => {
  const folder = join(root, dir);
  const sources = [];
  function visit(current) {
    for (const item of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, item.name);
      if (item.isDirectory()) visit(full);
      else if (/\.(?:js|jsx|css|mjs)$/.test(extname(full))) sources.push(full);
    }
  }
  visit(folder);
  return sources;
};

const blocked = [
  ['Quay về', 'Dashboard'].join(' '),
  'admin-preview-' + 'banner',
  ['giao diện công khai', 'không phải'].join(', '),
];
const files = [ ...scan('web/src'), ...scan('mobile/src'), ...scan('shared'), ...scan('web/dist/assets') ];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const pattern of blocked) {
    assert.equal(text.includes(pattern), false, `Banner cũ còn trong ${file}: ${pattern}`);
  }
}
const layout = readFileSync(join(root,'web/src/components/Layout.jsx'),'utf8');
const header = readFileSync(join(root,'web/src/components/Header.jsx'),'utf8');
const css = readFileSync(join(root,'web/src/styles.css'),'utf8');
assert.equal(layout.includes('adminPreview'),false,'Layout còn biến adminPreview');
assert.equal((header.match(/to="\/admin\/dashboard"/g)||[]).length,1,'Header phải có đúng một link Dashboard');
assert.match(header,/Về trang quản trị/);
assert.match(header,/Chế độ xem website công khai/);
assert.match(css,/\.site-header\s*\{top:0;/);
console.log(`PASS: quét ${files.length} tệp trong web/src, mobile/src, shared, web/dist/assets.`);
console.log('PASS: không còn banner cũ; Header chỉ có một nút Về trang quản trị.');
