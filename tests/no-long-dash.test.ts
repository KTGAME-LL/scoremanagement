import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const LONG = /[‒–—―−]/;
function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|html|md|mjs)$/.test(n)) out.push(p);
  }
  return out;
}

test('mã nguồn và tài liệu không còn dấu gạch dài', () => {
  const files = [...walk('src'), ...walk('scripts'), 'index.html', 'README.md'];
  const bad = files.filter((f) => LONG.test(readFileSync(f, 'utf8')));
  assert.deepEqual(bad, []);
});
