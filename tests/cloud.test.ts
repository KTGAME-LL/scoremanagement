import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CloudSync, type CloudHost, type CloudState, type Choice } from '../src/core/cloudSync';
import { defaultData, newCourse } from '../src/core/defaults';
import type { AppData } from '../src/core/types';

/** Drive giả trong bộ nhớ, đủ các điểm cuối mà ứng dụng dùng. */
function fakeDrive() {
  let file: { id: string; text: string; modified: number } | null = null;
  const calls: string[] = [];
  const f: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.split('?')[0].replace('https://www.googleapis.com', '')}`);
    const hdr = (init?.headers ?? {}) as Record<string, string>;
    assert.match(hdr.Authorization ?? '', /^Bearer tok/);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (url.includes('/drive/v3/files?') && method === 'GET') {
      assert.ok(url.includes('spaces=appDataFolder'));
      return json({ files: file ? [{ id: file.id, modifiedTime: new Date(file.modified).toISOString() }] : [] });
    }
    if (url.includes('alt=media')) return new Response(file?.text ?? '', { status: file ? 200 : 404 });
    if (url.includes('uploadType=multipart')) {
      const body = String(init?.body);
      const m = body.match(/\r\n\r\n(\{"app".*\})\r\n--/s);
      assert.ok(m, 'multipart có thân JSON');
      file = { id: 'file12345', text: m![1], modified: Date.now() };
      return json({ id: file.id, modifiedTime: new Date(file.modified).toISOString() });
    }
    if (url.includes('uploadType=media') && method === 'PATCH') {
      assert.ok(file);
      file = { ...file!, text: String(init?.body), modified: file!.modified + 1000 };
      return json({ id: file.id, modifiedTime: new Date(file.modified).toISOString() });
    }
    return new Response('?', { status: 500 });
  };
  return { f, calls, get: () => file, set: (d: AppData) => { file = { id: 'file12345', text: JSON.stringify({ app: 'diem-hoc-phan', version: 1, savedAt: new Date().toISOString(), data: d }), modified: (file?.modified ?? Date.now()) + 5000 }; } };
}

function setup(local: AppData, pick: Choice = 'remote') {
  const d = fakeDrive();
  let cur = local;
  const states: CloudState[] = [];
  const asked: unknown[] = [];
  const host: CloudHost = {
    getLocal: () => ({ data: cur, hasData: cur.courses.length > 0 }),
    applyRemote: (x) => { cur = x; },
    choose: async (i) => { asked.push(i); return pick; },
    onState: (s) => states.push(s),
  };
  const sync = new CloudSync(host, async () => 'tok1', d.f);
  return { d, sync, states, asked, cur: () => cur, setCur: (x: AppData) => { cur = x; } };
}
const withCourse = (name: string): AppData => {
  const x = defaultData();
  const c = newCourse(0, x.componentLibrary);
  c.name = name;
  x.courses.push(c);
  return x;
};

test('lần đầu: chưa có tệp trên Drive thì tạo bản sao lưu', async () => {
  const t = setup(withCourse('A'));
  await t.sync.connect(true);
  assert.equal(t.states.at(-1)?.status, 'synced');
  assert.ok(t.d.get());
});

test('máy trống: tự tải dữ liệu từ Drive, không hỏi', async () => {
  const t = setup(defaultData());
  t.d.set(withCourse('Từ Drive'));
  await t.sync.connect(true);
  assert.equal(t.cur().courses[0].name, 'Từ Drive');
  assert.equal(t.asked.length, 0);
});

test('hai bên đều có dữ liệu khác nhau: hỏi người dùng và làm theo lựa chọn', async () => {
  const a = setup(withCourse('Máy'), 'remote');
  a.d.set(withCourse('Drive'));
  await a.sync.connect(true);
  assert.equal(a.asked.length, 1);
  assert.equal(a.cur().courses[0].name, 'Drive');

  const b = setup(withCourse('Máy'), 'local');
  b.d.set(withCourse('Drive'));
  await b.sync.connect(true);
  assert.match(b.d.get()!.text, /"name":"Máy"/);

  const c = setup(withCourse('Máy'), 'cancel');
  c.d.set(withCourse('Drive'));
  await c.sync.connect(true);
  assert.equal(c.states.at(-1)?.status, 'signed-out');
  assert.equal(c.cur().courses[0].name, 'Máy');
});

test('đẩy thay đổi; phát hiện thiết bị khác đã sửa thì hỏi trước khi ghi đè', async () => {
  const t = setup(withCourse('A'), 'local');
  await t.sync.connect(true);
  t.setCur(withCourse('B'));
  await t.sync.push();
  assert.match(t.d.get()!.text, /"name":"B"/);
  assert.equal(t.asked.length, 0);
  t.d.set(withCourse('Từ máy khác'));
  t.setCur(withCourse('C'));
  await t.sync.push();
  assert.equal(t.asked.length, 1);
  assert.match(t.d.get()!.text, /"name":"C"/);
});

test('dữ liệu Drive bị hỏng hoặc độc hại được làm sạch', async () => {
  const t = setup(defaultData());
  const bad = { app: 'diem-hoc-phan', version: 1, data: { version: 1, settings: { scaleMax: 'x' }, courses: [{ name: '<script>', credits: 'abc', components: Array(40).fill({ name: 'x', weight: 99, score: -1 }) }] } };
  (t.d as unknown as { set: (d: AppData) => void }).set(bad.data as unknown as AppData);
  await t.sync.connect(true);
  const course = t.cur().courses[0];
  assert.ok(course.components.length <= 12);
  assert.ok(course.credits === null || Number.isFinite(course.credits));
});

test('token hết hạn: chuyển trạng thái cần đăng nhập lại, không mất dữ liệu', async () => {
  const d = fakeDrive();
  const { NeedLoginError } = await import('../src/core/google');
  const states: CloudState[] = [];
  const data = withCourse('A');
  const sync = new CloudSync(
    { getLocal: () => ({ data, hasData: true }), applyRemote: () => {}, choose: async () => 'cancel', onState: (s) => states.push(s) },
    async () => { throw new NeedLoginError(); },
    d.f,
  );
  await sync.connect(false);
  assert.equal(states.at(-1)?.status, 'needs-login');
  assert.equal(d.calls.length, 0);
});
