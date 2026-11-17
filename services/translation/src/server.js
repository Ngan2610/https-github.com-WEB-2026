// HTTP server (chỉ dùng thư viện chuẩn của Node, không cần npm install).
// Chỉ nên truy cập qua mạng nội bộ Docker; API Dubchef là cổng duy nhất ra ngoài.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { translateCooking, modelStatus, TranslationError } from './translate.js';
import { listGlossary } from './glossary.js';

const MAX_BODY = 16 * 1024;
const send = (res, status, body) => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(data) });
  res.end(data);
};

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new TranslationError('invalid')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new TranslationError('invalid')); } });
    req.on('error', () => reject(new TranslationError('invalid')));
  });
}

function tokenOk(header, expected) {
  if (!expected) return true; // không đặt INTERNAL_TOKEN thì chỉ dựa vào mạng nội bộ Docker
  const a = Buffer.from(String(header || '')); const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createServer({ translate = translateCooking, status = modelStatus, internalToken = process.env.INTERNAL_TOKEN || '' } = {}) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'translation' });
      if (!tokenOk(req.headers['x-internal-token'], internalToken)) return send(res, 401, { code: 'auth' });
      if (req.method === 'GET' && url.pathname === '/health/model') {
        const s = await status();
        return send(res, s.reachable && s.modelReady ? 200 : 503, { ok: s.reachable && s.modelReady, ...s });
      }
      if (req.method === 'GET' && url.pathname === '/glossary') {
        const from = url.searchParams.get('from') || 'en'; const to = url.searchParams.get('to') || 'vi';
        return send(res, 200, { from, to, terms: listGlossary(from, to) });
      }
      if (req.method === 'POST' && url.pathname === '/translate') {
        const { text, from, to } = await readJson(req);
        return send(res, 200, await translate({ text, from, to }));
      }
      return send(res, 404, { code: 'not_found' });
    } catch (e) {
      const code = e instanceof TranslationError ? e.code : 'server';
      const status = code === 'invalid' ? 400 : (code === 'unavailable' || code === 'model_missing') ? 503 : 502;
      return send(res, status, { code });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4100);
  createServer().listen(port, '0.0.0.0', () => console.log(`Translation service chạy ở cổng ${port}`));
}
