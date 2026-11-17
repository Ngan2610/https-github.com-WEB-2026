import {createAccountService} from './services/accountService.js';
import {createPaymentService} from './services/paymentService.js';
import {createVideoService} from './services/videoService.js';
import {createAdminService} from './services/adminService.js';
import {createCommunityService} from './services/communityService.js';
import {createTranslationService} from './services/translationService.js';
import {createVideoStorage} from './repositories/videoStorage.js';
import { registerAdminRoutes } from './routes/adminRoutes.js';
import { registerCommunityRoutes } from './routes/communityRoutes.js';
import { registerVideoRoutes } from './routes/videoRoutes.js';
import { registerAccountRoutes } from './routes/accountRoutes.js';
import { registerPaymentRoutes } from './routes/paymentRoutes.js';
import { registerTranslationRoutes } from './routes/translationRoutes.js';
// Các đường dẫn API. `repo` là lớp truy cập CSDL (db.js), tách ra để dễ thay khi kiểm thử.
import express from 'express';
import { join, resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import cors from 'cors';
import { createPayosGateway } from './payos.js';
import { QuotaError } from './entitlements.js';
import { createTranslator } from './translationClient.js';
import { parseAllowedOrigins } from './securityConfig.js';

const MAX_VIDEO = 150 * 1024 * 1024;
const DEFAULT_UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);


export function createApp(repo, { corsOrigin = '*', secret = 'dev-secret', tz = 7, uploadDir = DEFAULT_UPLOAD_DIR, maxUploadBytes = MAX_VIDEO,
  paymentMode = process.env.PAYMENT_MODE || 'disabled',
  payosGateway = null, adminReady = true, translator = createTranslator() } = {}) {
  if (!['demo', 'payos', 'disabled'].includes(paymentMode)) throw new Error('PAYMENT_MODE không hợp lệ');
  if (paymentMode === 'demo' && process.env.NODE_ENV === 'production' && process.env.LOCAL_DOCKER_INSTALL !== 'true')
    throw new Error('PAYMENT_MODE=demo chỉ được chạy trong môi trường phát triển/Docker cục bộ.');
  // Dùng SDK nội bộ có chữ ký. Tránh gọi nhà cung cấp nếu chưa cấu hình.
  let gateway = payosGateway;
  if (paymentMode === 'payos' && !gateway) {
    // Never start a supposedly real payment environment without valid provider configuration.
    gateway = createPayosGateway();
  }
  const UPLOAD_DIR = resolve(uploadDir);
  const app = express();
  if (process.env.NODE_ENV === 'production' && corsOrigin === '*')
    throw new Error('Production không cho phép CORS_ORIGIN=*');
  const origins = corsOrigin === '*' ? true : parseAllowedOrigins(corsOrigin);
  app.use(cors({ origin: origins, optionsSuccessStatus: 204 }));
  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Frame-Options', 'DENY');
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.set('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.path.startsWith('/api/')) res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    next();
  });

  // In-memory diagnostic counters; no customer data or secrets are logged.
  const metrics = { requests: 0, failures: 0, totalMs: 0, byStatus: new Map() };
  app.use((req, res, next) => {
    if (req.path === '/api/metrics') return next();
    const start = process.hrtime.bigint();
    res.once('finish', () => {
      metrics.requests += 1;
      if (res.statusCode >= 500) metrics.failures += 1;
      metrics.totalMs += Number(process.hrtime.bigint() - start) / 1e6;
      const status = String(res.statusCode);
      metrics.byStatus.set(status, (metrics.byStatus.get(status) || 0) + 1);
    });
    next();
  });
  app.get('/api/metrics', (req, res) => {
    const token = process.env.METRICS_TOKEN || '';
    if (token.length < 24) return res.status(404).json({ code: 'not_found' });
    const submitted = /^Bearer (.+)$/i.exec(req.get('authorization') || '')?.[1] || '';
    const expected = Buffer.from(token); const received = Buffer.from(submitted);
    if (expected.length !== received.length || !timingSafeEqual(expected, received))
      return res.status(401).json({ code: 'auth' });
    const lines = [
      '# TYPE dubchef_http_requests_total counter',
      `dubchef_http_requests_total ${metrics.requests}`,
      '# TYPE dubchef_http_failures_total counter',
      `dubchef_http_failures_total ${metrics.failures}`,
      '# TYPE dubchef_http_response_ms_total counter',
      `dubchef_http_response_ms_total ${metrics.totalMs.toFixed(3)}`,
    ];
    for (const [status, count] of metrics.byStatus) lines.push(`dubchef_http_status_total{status="${status}"} ${count}`);
    res.type('text/plain; version=0.0.4').send(lines.join('\n') + '\n');
  });

  // Giới hạn yêu cầu theo IP cho các endpoint công khai nhạy cảm.
  // Không tin X-Forwarded-For từ client (Express trust proxy mặc định là false).
  const requestBuckets = new Map();
  const throttle = (name, max, windowMs) => (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${req.ip}`;
    const old = requestBuckets.get(key);
    if (!old || old.until <= now) {
      if (requestBuckets.size >= 10000) {
        for (const [k, v] of requestBuckets) if (v.until <= now) requestBuckets.delete(k);
        if (requestBuckets.size >= 10000) return res.status(429).json({ code: 'too_many' });
      }
      requestBuckets.set(key, { count: 1, until: now + windowMs });
      return next();
    }
    if (old.count >= max) {
      res.set('Retry-After', String(Math.max(1, Math.ceil((old.until - now) / 1000))));
      return res.status(429).json({ code: 'too_many' });
    }
    old.count++;
    return next();
  };

  const storage=createVideoStorage(UPLOAD_DIR,maxUploadBytes);
  const services={
    account:createAccountService(repo,secret),
    payment:createPaymentService(repo,{paymentMode,gateway}),
    video:createVideoService(repo,{storage,maxUploadBytes}),
    community:createCommunityService(repo),
    translation:createTranslationService(repo,{translator,adminReady}),
  };
  services.admin=createAdminService(repo,{tz,video:services.video,storage});

  // Xác thực lại với SQL ở mỗi request: khóa/xóa tài khoản sẽ vô hiệu hóa token cũ.
  const auth = wrap(async (req, res, next) => {
    const token = /^Bearer (.+)$/i.exec(req.get('authorization') || '');
    req.currentUser = await services.account.authenticate(token?.[1]);
    next();
  });
  const adminOnly = [auth, (req, res, next) => req.currentUser.role === 'admin'
    ? next() : res.status(403).json({ code: 'forbidden' })];
  // Admin chỉ quản lý/đối soát; không thể tạo đơn hoặc tự xác nhận mua gói như khách hàng.
  const customerOnly = [auth, (req, res, next) => req.currentUser.role === 'user'
    ? next() : res.status(403).json({ code: 'forbidden' })];
  const dependencies = {services, throttle, auth, adminOnly, customerOnly};

  registerTranslationRoutes(app, dependencies);

  registerPaymentRoutes(app, dependencies);

  registerAccountRoutes(app, dependencies);

  registerVideoRoutes(app, dependencies);

  registerCommunityRoutes(app, dependencies);

  registerAdminRoutes(app, dependencies);

  // JSON 404, tránh trả HTML cho đường dẫn API sai.
  app.use('/api', (_req, res) => res.status(404).json({ code: 'not_found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.domainError === true) return res.status(err.status).json({code:err.code,...err.details});
    if (err instanceof QuotaError) return res.status(409).json({code:err.code});
    if (['invalid_job_options','source_timeline_missing','invalid_source_timestamps',
      'video_file_missing','job_not_found','job_not_completed','job_enqueue_failed',
      'video_not_found'].includes(err?.code) && Number.isInteger(err?.status))
      return res.status(err.status).json({code:err.code});
    if (err?.code==='idempotency_conflict') return res.status(409).json({code:err.code});
    if (err && err.type === 'entity.parse.failed') return res.status(400).json({ code: 'invalid_json' });
    if (err && err.type === 'entity.too.large') return res.status(413).json({ code: 'too_large' });
    if (process.env.NODE_ENV === 'production') console.error('API error:', err?.name || 'internal');
    else console.error(err);
    res.status(500).json({ code: 'server' });
  });
  return app;
}
