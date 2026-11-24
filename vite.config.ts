import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('./src/syncConfig.json', import.meta.url), 'utf8'));
const connect = cfg.url && cfg.anonKey && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(cfg.url) ? cfg.url : "'none'";

// Chỉ chèn Content-Security-Policy khi build (chế độ dev của Vite cần script nội tuyến).
const csp: Plugin = {
  name: 'diem-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      `connect-src ${connect}`,
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
  },
};

export default defineConfig({
  plugins: [react(), csp],
  base: './',
  build: { sourcemap: false, target: 'es2020' },
});
