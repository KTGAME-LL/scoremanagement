import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuthError, AuthService, validatePassword, validateUsername, type KV } from '../src/core/auth';
import { SecureStorageAdapter, migrateLegacy } from '../src/core/secureStorage';
import { defaultData, newCourse } from '../src/core/defaults';

const mem = (): KV & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v), remove: (k) => void m.delete(k) };
};
const make = (now = () => Date.now()) => {
  const kv = mem();
  const ses = mem();
  return { kv, ses, auth: new AuthService(kv, ses, 1000, now) };
};

test('kiểm tra tên đăng nhập', () => {
  assert.equal(validateUsername('huy.luc_01'), null);
  assert.equal(validateUsername('Lực'), null);
  for (const bad of ['', 'ab', 'a'.repeat(33), ' x y ', 'a b c', '.abc', 'ab..c', '<script>', "a'; drop", 'a\u0000bc', 'ab/cd']) {
    assert.ok(validateUsername(bad), `phải từ chối: ${JSON.stringify(bad)}`);
  }
});

test('kiểm tra mật khẩu', () => {
  assert.equal(validatePassword('Matkhau-Tot9', 'huy'), null);
  for (const bad of ['short1', 'chicoChu', '12345678', 'password1', 'aaaaaaa1', 'huyluc123x'.replace('x', ''), 'a1\u0000bcdefg', 'x'.repeat(129) + '1']) {
    assert.ok(validatePassword(bad, 'huyluc123'), `phải từ chối: ${JSON.stringify(bad).slice(0, 30)}`);
  }
});

test('đăng ký, đăng nhập, mật khẩu sai, không lộ tên tồn tại', async () => {
  const { auth } = make();
  const s = await auth.register('Huy', 'Mat-khau-9x', 'Mat-khau-9x');
  assert.equal(s.username, 'Huy');
  const ok = await auth.login('  HUY ', 'Mat-khau-9x');
  assert.equal(ok.id, s.id);
  await assert.rejects(auth.login('huy', 'sai-mat-khau-1'), (e: AuthError) => e.message === 'Tên đăng nhập hoặc mật khẩu không đúng.');
  await assert.rejects(auth.login('khong-co', 'sai-mat-khau-1'), (e: AuthError) => e.message === 'Tên đăng nhập hoặc mật khẩu không đúng.');
  await assert.rejects(auth.register('huy', 'Mat-khau-9x', 'Mat-khau-9x'), /đã tồn tại/);
  await assert.rejects(auth.register('moi', 'Mat-khau-9x', 'khac-9xxxx'), /không khớp/);
});

test('khóa tạm sau nhiều lần sai và mở lại khi hết hạn', async () => {
  let t = 1_000_000;
  const { auth } = make(() => t);
  await auth.register('huy', 'Mat-khau-9x', 'Mat-khau-9x');
  for (let i = 0; i < 5; i++) await assert.rejects(auth.login('huy', 'sai-mat-khau-1'));
  await assert.rejects(auth.login('huy', 'Mat-khau-9x'), /Thử lại sau/);
  t += 31_000;
  assert.ok(await auth.login('huy', 'Mat-khau-9x'));
});

test('dữ liệu được mã hóa, đọc lại đúng, sai khóa thì không đọc được', async () => {
  const { auth, kv } = make();
  const s = await auth.register('huy', 'Mat-khau-9x', 'Mat-khau-9x');
  const ad = new SecureStorageAdapter(kv, s.id, s.dek);
  const d = defaultData();
  const c = newCourse(0, d.componentLibrary);
  c.name = 'Bí mật ABC';
  d.courses.push(c);
  await ad.save(d);
  const stored = kv.m.get(`diem-app:u:${s.id}`) as string;
  assert.ok(!stored.includes('Bí mật'));
  assert.equal((await ad.load()).data.courses[0].name, 'Bí mật ABC');
  await auth.register('khac', 'Mat-khau-8y', 'Mat-khau-8y');
  const other = await auth.login('khac', 'Mat-khau-8y');
  const bad = new SecureStorageAdapter(kv, s.id, other.dek);
  const r = await bad.load();
  assert.equal(r.fresh, true);
  assert.equal(r.data.courses.length, 0);
});

test('đổi mật khẩu giữ nguyên dữ liệu; xóa tài khoản xóa dữ liệu', async () => {
  const { auth, kv } = make();
  const s = await auth.register('huy', 'Mat-khau-9x', 'Mat-khau-9x');
  const ad = new SecureStorageAdapter(kv, s.id, s.dek);
  const d = defaultData();
  d.courses.push(newCourse(0, d.componentLibrary));
  await ad.save(d);
  await assert.rejects(auth.changePassword('huy', 'sai-sai-1xx', 'Mat-khau-moi1', 'Mat-khau-moi1'), /hiện tại không đúng/);
  await auth.changePassword('huy', 'Mat-khau-9x', 'Mat-khau-moi1', 'Mat-khau-moi1');
  await assert.rejects(auth.login('huy', 'Mat-khau-9x'));
  const s2 = await auth.login('huy', 'Mat-khau-moi1');
  assert.equal((await new SecureStorageAdapter(kv, s2.id, s2.dek).load()).data.courses.length, 1);
  await assert.rejects(auth.deleteAccount('huy', 'sai-sai-1xx'));
  await auth.deleteAccount('huy', 'Mat-khau-moi1');
  assert.equal(kv.get(`diem-app:u:${s.id}`), null);
  assert.equal(auth.hasAccounts(), false);
});

test('giữ phiên trong tab và dữ liệu tài khoản hỏng không làm sập', async () => {
  const { auth, kv, ses } = make();
  const s = await auth.register('huy', 'Mat-khau-9x', 'Mat-khau-9x');
  auth.remember(s);
  const r = await auth.resume();
  assert.equal(r?.id, s.id);
  auth.logout(r);
  assert.equal(await auth.resume(), null);
  ses.set('diem-app:session:v1', '{"id":"zz","raw":"@@"}');
  assert.equal(await auth.resume(), null);
  kv.set('diem-app:auth:v1', '{"huy": 5, "x": {"id":"../../etc"}}');
  assert.equal(auth.hasAccounts(), false);
});

test('chuyển dữ liệu cũ chưa mã hóa vào tài khoản mới', async () => {
  const { auth, kv } = make();
  const d = defaultData();
  d.courses.push(newCourse(0, d.componentLibrary));
  kv.set('diem-app:v1', JSON.stringify(d));
  assert.equal(auth.hasLegacyData(), true);
  const s = await auth.register('huy', 'Mat-khau-9x', 'Mat-khau-9x');
  const n = await migrateLegacy(kv, new SecureStorageAdapter(kv, s.id, s.dek));
  assert.equal(n, 1);
  assert.equal(kv.get('diem-app:v1'), null);
});
