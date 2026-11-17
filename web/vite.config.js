import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' để chạy được khi đặt web ở thư mục con (ví dụ GitHub Pages)
export default defineConfig({
  base: './',
  plugins: [react()],
  // 'es': whisper.worker.js dùng import() động (từ thư viện @huggingface/transformers) để tải
  // đúng backend WebAssembly cần thiết — định dạng mặc định 'iife' của Vite không hỗ trợ việc này.
  worker: { format: 'es' },
  test: {
    env: {
      VITE_API_URL: '', VITE_PAYMENT_API_URL: '', VITE_PUBLIC_BASE_URL: '', VITE_PUBLIC_URL: '',
      VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '',
      VITE_ALLOW_LOCAL_DEMO: 'true',
    },
    environment: 'jsdom', // giả lập trình duyệt để test giao diện
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Frontend gọi /backend/api/* trên cùng hostname:5173.
    // Vite chuyển tiếp sang API Windows local:4000 (trong Docker vẫn dùng api:3000) => không cần IP LAN cố định và không bị lỗi CORS.
    proxy: {
      '/backend': {
        target: process.env.WEB_DEV_API_TARGET || 'http://127.0.0.1:4000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend/, ''),
      },
    },
  },
});
