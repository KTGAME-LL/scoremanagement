// CSP chỉ cho phép: mã đã đóng gói (băm SHA-256), dịch vụ đăng nhập Google và Google Drive API.
// Đóng gói toàn bộ ứng dụng thành MỘT tệp HTML (diem-app.html) chạy offline, không cần máy chủ.
// Chạy: node scripts/build-single.mjs   (cần esbuild, react, react-dom đã cài)
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const out = await esbuild.build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  write: false,
  outdir: resolve(root, 'dist-single'),
  format: 'iife',
  target: 'es2020',
  minify: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.css': 'css' },
  legalComments: 'none',
  nodePaths: process.env.NODE_PATH ? process.env.NODE_PATH.split(':') : [],
  logLevel: 'warning',
});

let js = '';
let css = '';
for (const f of out.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  else if (f.path.endsWith('.css')) css = f.text;
}
// Tránh chuỗi đóng thẻ script nằm trong mã.
js = js.replace(/<\/script/gi, '<\\/script');
css = css.replace(/<\/style/gi, '<\\/style');

const sha = (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`;
const csp = [
  "default-src 'none'",
  `script-src ${sha(js)} https://accounts.google.com/gsi/client`,
  `style-src ${sha(css)} https://accounts.google.com/gsi/style`,
  "img-src data:",
  "connect-src https://www.googleapis.com https://accounts.google.com/gsi/",
  "frame-src https://accounts.google.com/gsi/",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const icon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f5c7a'/%3E%3Ctext x='16' y='23' font-size='21' text-anchor='middle' fill='white' font-family='sans-serif'%3E%CE%A3%3C/text%3E%3C/svg%3E";
const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>Điểm học phần: tính điểm theo trọng số</title>
<link rel="icon" href="${icon}">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${js}</script>
</body>
</html>
`;
mkdirSync(resolve(root, 'dist-single'), { recursive: true });
const target = resolve(root, 'diem-app.html');
writeFileSync(target, html);
console.log(`Đã tạo ${target} (${(html.length / 1024).toFixed(0)} KB)`);
