import { muxLanguages } from './multitrack.js';
/** Render microservice: HTTP API on Docker internal network, no npm runtime deps. */
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { rm, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { produceVoiceover } from './audioExport.js';

const LANG = new Set(['vi', 'en', 'zh']);
const FORMATS = new Set(['mp3', 'mp4']);
const MAX_BODY = 100 * 1024;
const send = (res, status, body) => {
  const content = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(content), 'X-Content-Type-Options': 'nosniff' });
  res.end(content);
};
const sameToken = (received, expected) => {
  if (!expected) return true; // Only private Docker networking; configure token for deployments.
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
const httpError = (status, code) => Object.assign(new Error(code), { status, code });

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw httpError(413, 'too_large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, 'invalid_json'); }
}

export async function safeSourceVideo(file, root = process.env.UPLOAD_DIR || '/app/server/uploads') {
  if (typeof file !== 'string' || !file) throw httpError(400, 'invalid_video_path');
  const base = await realpath(root);
  const target = await realpath(file).catch(() => { throw httpError(404, 'video_not_found'); });
  if (!target.startsWith(base + sep)) throw httpError(403, 'video_path_forbidden');
  const info = await stat(target);
  if (!info.isFile() || info.size > 160 * 1024 * 1024) throw httpError(413, 'invalid_video_size');
  return target;
}

export function createServer({ render = produceVoiceover, internalToken = process.env.RENDER_INTERNAL_TOKEN || '', uploadRoot = process.env.UPLOAD_DIR || '/app/server/uploads' } = {}) {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, service: 'render', tts: 'espeak-ng' });
      if (!sameToken(req.headers['x-internal-token'], internalToken)) return send(res, 401, { code: 'auth' });
      if (!['/render','/mux'].includes(req.url) || req.method !== 'POST') return send(res, 404, { code: 'not_found' });
      if (req.headers['content-type']?.split(';')[0] !== 'application/json') return send(res, 415, { code: 'invalid_content_type' });
      const body=await readJson(req);
      if(!body||typeof body!=='object'||Array.isArray(body))return send(res,400,{code:'invalid'});
      let language=body.language,format=body.format,result;
      if(req.url==='/mux') {
        if(!Array.isArray(body.tracks)||body.tracks.length<2||body.tracks.length>3||
          new Set(body.tracks.map(x=>x?.language)).size!==body.tracks.length ||
          body.tracks.some(x=>!LANG.has(x?.language)))return send(res,400,{code:'invalid'});
        const tracks=[];
        for(const track of body.tracks) tracks.push({language:track.language,path:await safeSourceVideo(track.path,uploadRoot)});
        result=await muxLanguages(tracks);language='multi';format='mp4';
      } else {
        const {content,sourceVideoPath}=body;
        if (!LANG.has(language) || !FORMATS.has(format) || content == null) return send(res, 400, { code: 'invalid' });
        const sourceVideo = format === 'mp4' ? await safeSourceVideo(sourceVideoPath, uploadRoot) : null;
        result = await render({ content, language, format, sourceVideo });
      }
      const type = format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
      res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': `attachment; filename="dubchef-${language}.${format}"`, 'X-Content-Type-Options': 'nosniff' });
      // Async iterator respects backpressure and aborts on disconnected consumers.
      try {
        for await (const chunk of createReadStream(result.output)) {
          if (res.destroyed) break;
          if (!res.write(chunk)) await new Promise((resolveWait) => res.once('drain', resolveWait));
        }
        if (!res.destroyed) res.end();
      } finally {
        await rm(result.directory, { recursive: true, force: true }).catch(() => {});
      }
    } catch (err) {
      if (res.headersSent) { res.destroy(); return; }
      const code = String(err.code || 'render_failed');
      const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
      if (status === 500) console.error('[render] export failed:', code);
      send(res, status, { code, ...(Number.isSafeInteger(err.segment) ? { segment: err.segment } : {}) });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 4200);
  createServer().listen(port, '0.0.0.0', () => console.log(`[render] listening on ${port}`));
}
