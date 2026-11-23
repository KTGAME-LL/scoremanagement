import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultData, newCourse } from '../src/core/defaults';
import { toXlsx } from '../src/core/excelExport';
import { colName, esc, zipStore } from '../src/core/xlsx';

test('tên cột Excel', () => {
  assert.equal(colName(1), 'A');
  assert.equal(colName(26), 'Z');
  assert.equal(colName(27), 'AA');
  assert.equal(colName(703), 'AAA');
});

test('esc loại ký tự điều khiển và thoát ký tự XML', () => {
  assert.equal(esc('a<b>&"c\u0001'), 'a&lt;b&gt;&amp;&quot;c');
});

test('tệp xlsx là gói zip hợp lệ, có đủ phần, chuỗi độc hại không thành công thức', () => {
  const d = defaultData();
  const c = newCourse(0, d.componentLibrary);
  c.name = '=HYPERLINK("http://x","y")<b>&';
  c.code = '@SUM(1)';
  d.courses.push(c);
  const bytes = toXlsx(d);
  assert.equal(bytes[0], 0x50);
  assert.equal(bytes[1], 0x4b);
  const dir = mkdtempSync(join(tmpdir(), 'xl-'));
  const f = join(dir, 'a.xlsx');
  writeFileSync(f, bytes);
  try {
    const out = execFileSync('unzip', ['-t', f], { encoding: 'utf8' });
    assert.match(out, /No errors detected/);
    const sheet = execFileSync('unzip', ['-p', f, 'xl/worksheets/sheet2.xml'], { encoding: 'utf8' });
    assert.ok(!sheet.includes('<f>'), 'không có công thức');
    assert.ok(sheet.includes('=HYPERLINK(&quot;http://x&quot;,&quot;y&quot;)&lt;b&gt;&amp;'));
    const wb = execFileSync('unzip', ['-p', f, 'xl/workbook.xml'], { encoding: 'utf8' });
    for (const n of ['Tổng quan', 'Bảng điểm', 'Chi tiết thành phần', 'Mục tiêu điểm', 'Cấu hình']) assert.ok(wb.includes(n), n);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return; // máy không có unzip
    throw e;
  }
});

test('zipStore ghi đúng số mục', () => {
  const z = zipStore([{ name: 'a.txt', data: new TextEncoder().encode('hi') }]);
  const v = new DataView(z.buffer, z.byteLength - 22);
  assert.equal(v.getUint16(10, true), 1);
});
