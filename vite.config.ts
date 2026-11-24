import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

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
      "connect-src 'none'",
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
