/**
 * Tài khoản cục bộ (tên đăng nhập + mật khẩu) chạy hoàn toàn trong trình duyệt.
 *
 * Thiết kế:
 * - Mật khẩu không bao giờ được lưu. Từ mật khẩu + muối ngẫu nhiên, PBKDF2-SHA256 (600.000 vòng) tạo khóa K.
 * - Mỗi tài khoản có một khóa dữ liệu DEK ngẫu nhiên 256 bit. DEK được bọc bằng K (AES-GCM) và lưu lại.
 *   Đăng nhập đúng khi giải được DEK (thẻ xác thực GCM không khớp nếu sai mật khẩu).
 * - Dữ liệu điểm của tài khoản được mã hóa AES-GCM bằng DEK trước khi ghi vào localStorage.
 * - Sai mật khẩu nhiều lần sẽ bị khóa tạm với thời gian tăng dần.
 * Giới hạn: tài khoản nằm trong trình duyệt này, không có máy chủ nên không đồng bộ giữa các máy
 * và KHÔNG thể khôi phục mật khẩu (quên mật khẩu thì dữ liệu mã hóa không đọc lại được).
 */

export interface KV {
  get(k: string): string | null;
  set(k: string, v: string): void;
  remove(k: string): void;
}

export const PBKDF2_ITERATIONS = 600_000;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
const MAX_FAILS = 5;
const ACCOUNTS_KEY = 'diem-app:auth:v1';
const LOCK_KEY = 'diem-app:auth:lock:v1';
export const SESSION_KEY = 'diem-app:session:v1';
export const LEGACY_KEYS = ['diem-app:v1', 'diem-app:v1:backup'];
export const MAX_ACCOUNTS = 20;

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------- Kiểm tra đầu vào ---------- */
const COMMON = new Set([
  '12345678', '123456789', '1234567890', '87654321', '11111111', '00000000', '12341234', '123123123',
  'password', 'password1', 'password123', 'passw0rd', 'qwertyui', 'qwertyuiop', 'qwerty123', 'abc12345',
  'abcd1234', 'iloveyou', 'admin123', 'letmein123', 'welcome123', 'matkhau123', 'matkhau1', 'dangnhap1',
]);

export function normalizeUsername(raw: string): string {
  return raw.normalize('NFC').trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const u = raw.normalize('NFC').trim();
  if (u.length < USERNAME_MIN) return `Tên đăng nhập cần ít nhất ${USERNAME_MIN} ký tự.`;
  if (u.length > USERNAME_MAX) return `Tên đăng nhập tối đa ${USERNAME_MAX} ký tự.`;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(u)) return 'Tên đăng nhập chỉ gồm chữ, số, dấu chấm, gạch dưới, gạch ngang và phải bắt đầu bằng chữ hoặc số.';
  if (/[._-]{2,}/.test(u)) return 'Tên đăng nhập không được có hai dấu phân cách liền nhau.';
  return null;
}

export function validatePassword(pw: string, username = ''): string | null {
  if (pw.length < PASSWORD_MIN) return `Mật khẩu cần ít nhất ${PASSWORD_MIN} ký tự.`;
  if (pw.length > PASSWORD_MAX) return `Mật khẩu tối đa ${PASSWORD_MAX} ký tự.`;
  if (/[\u0000-\u001f\u007f]/.test(pw)) return 'Mật khẩu chứa ký tự không hợp lệ.';
  if (!/\p{L}/u.test(pw) || !/\p{N}/u.test(pw)) return 'Mật khẩu cần có cả chữ và số.';
  if (new Set(pw).size < 4) return 'Mật khẩu quá đơn giản (lặp lại quá nhiều ký tự).';
  const lower = pw.toLowerCase();
  if (COMMON.has(lower)) return 'Mật khẩu này quá phổ biến, hãy chọn mật khẩu khác.';
  const u = normalizeUsername(username);
  if (u.length >= 3 && lower.includes(u)) return 'Mật khẩu không được chứa tên đăng nhập.';
  return null;
}

/* ---------- Base64 và mật mã ---------- */
export function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function unb64(s: string, expectLen?: number): Uint8Array {
  if (typeof s !== 'string' || s.length > 4_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw new Error('bad-b64');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  if (expectLen !== undefined && out.length !== expectLen) throw new Error('bad-len');
  return out;
}
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function deriveKey(password: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const importDek = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

export async function encryptJson(dek: CryptoKey, value: unknown): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, enc.encode(JSON.stringify(value))));
  return JSON.stringify({ v: 1, iv: b64(iv), ct: b64(ct) });
}
export async function decryptJson(dek: CryptoKey, text: string): Promise<unknown> {
  const o = JSON.parse(text) as { v?: number; iv?: string; ct?: string };
  if (o.v !== 1 || typeof o.iv !== 'string' || typeof o.ct !== 'string') throw new Error('bad-format');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(o.iv, 12) }, dek, unb64(o.ct));
  return JSON.parse(dec.decode(pt));
}

/* ---------- Tài khoản ---------- */
interface Account {
  id: string;
  display: string;
  salt: string;
  iter: number;
  iv: string;
  wrapped: string;
  created: string;
}
type Accounts = Record<string, Account>;
interface Lock { fails: number; until: number }

export interface Session {
  id: string;
  username: string;
  dek: CryptoKey;
  /** Chỉ dùng để giữ phiên trong tab khi tải lại trang. */
  raw: Uint8Array;
}

export class AuthError extends Error {
  constructor(message: string, public field?: 'username' | 'password' | 'confirm' | 'form') {
    super(message);
    this.name = 'AuthError';
  }
}

const GENERIC = 'Tên đăng nhập hoặc mật khẩu không đúng.';

export class AuthService {
  constructor(
    private kv: KV,
    private session: KV,
    private iterations = PBKDF2_ITERATIONS,
    private now: () => number = () => Date.now(),
  ) {}

  private accounts(): Accounts {
    try {
      const o = JSON.parse(this.kv.get(ACCOUNTS_KEY) || '{}');
      if (typeof o !== 'object' || o === null || Array.isArray(o)) return {};
      const out: Accounts = {};
      for (const [k, a] of Object.entries(o as Record<string, Account>)) {
        if (a && typeof a.id === 'string' && /^[0-9a-f]{32}$/.test(a.id) && typeof a.salt === 'string' && typeof a.wrapped === 'string' && typeof a.iv === 'string' && Number.isInteger(a.iter) && a.iter >= 1000 && a.iter <= 5_000_000) {
          out[k] = { ...a, display: String(a.display ?? k).slice(0, USERNAME_MAX) };
        }
      }
      return out;
    } catch {
      return {};
    }
  }
  private saveAccounts(a: Accounts) {
    this.kv.set(ACCOUNTS_KEY, JSON.stringify(a));
  }
  private locks(): Record<string, Lock> {
    try {
      const o = JSON.parse(this.kv.get(LOCK_KEY) || '{}');
      return typeof o === 'object' && o !== null && !Array.isArray(o) ? o : {};
    } catch {
      return {};
    }
  }
  private setLock(u: string, l: Lock | null) {
    const all = this.locks();
    if (l) all[u] = l;
    else delete all[u];
    this.kv.set(LOCK_KEY, JSON.stringify(all));
  }

  hasAccounts(): boolean {
    return Object.keys(this.accounts()).length > 0;
  }
  hasLegacyData(): boolean {
    return LEGACY_KEYS.some((k) => !!this.kv.get(k));
  }
  dataKey(id: string): string {
    return `diem-app:u:${id}`;
  }

  async register(usernameRaw: string, password: string, confirm: string): Promise<Session> {
    const ue = validateUsername(usernameRaw);
    if (ue) throw new AuthError(ue, 'username');
    const pe = validatePassword(password, usernameRaw);
    if (pe) throw new AuthError(pe, 'password');
    if (password !== confirm) throw new AuthError('Mật khẩu nhập lại không khớp.', 'confirm');
    const key = normalizeUsername(usernameRaw);
    const all = this.accounts();
    if (all[key]) throw new AuthError('Tên đăng nhập này đã tồn tại.', 'username');
    if (Object.keys(all).length >= MAX_ACCOUNTS) throw new AuthError(`Trình duyệt này đã có tối đa ${MAX_ACCOUNTS} tài khoản.`, 'form');
    const salt = rand(16);
    const k = await deriveKey(password, salt, this.iterations);
    const raw = rand(32);
    const iv = rand(12);
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, raw));
    const id = Array.from(rand(16), (x) => x.toString(16).padStart(2, '0')).join('');
    all[key] = { id, display: usernameRaw.normalize('NFC').trim(), salt: b64(salt), iter: this.iterations, iv: b64(iv), wrapped: b64(wrapped), created: new Date(this.now()).toISOString() };
    this.saveAccounts(all);
    return { id, username: all[key].display, dek: await importDek(raw), raw };
  }

  /** Thời gian còn bị khóa (giây), 0 nếu không khóa. */
  lockedSeconds(usernameRaw: string): number {
    const l = this.locks()[normalizeUsername(usernameRaw)];
    return l && l.until > this.now() ? Math.ceil((l.until - this.now()) / 1000) : 0;
  }

  private async unwrap(a: Account, password: string): Promise<Uint8Array | null> {
    try {
      const k = await deriveKey(password, unb64(a.salt, 16), a.iter);
      return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(a.iv, 12) }, k, unb64(a.wrapped)));
    } catch {
      return null;
    }
  }

  async login(usernameRaw: string, password: string): Promise<Session> {
    if (typeof usernameRaw !== 'string' || typeof password !== 'string' || usernameRaw.length > 200 || password.length > 1000) throw new AuthError(GENERIC, 'form');
    const key = normalizeUsername(usernameRaw);
    if (!key || !password) throw new AuthError('Hãy nhập tên đăng nhập và mật khẩu.', 'form');
    const wait = this.lockedSeconds(key);
    if (wait > 0) throw new AuthError(`Đã nhập sai nhiều lần. Thử lại sau ${wait >= 60 ? `${Math.ceil(wait / 60)} phút` : `${wait} giây`}.`, 'form');
    const acc = this.accounts()[key];
    // Tài khoản không tồn tại vẫn tốn thời gian tương đương để không lộ tên nào có thật.
    const raw = acc ? await this.unwrap(acc, password) : (await deriveKey(password, rand(16), this.iterations), null);
    if (!acc || !raw || raw.length !== 32) {
      const prev = this.locks()[key]?.fails ?? 0;
      const fails = prev + 1;
      const until = fails >= MAX_FAILS ? this.now() + Math.min(900, 30 * 2 ** (fails - MAX_FAILS)) * 1000 : 0;
      this.setLock(key, { fails, until });
      throw new AuthError(GENERIC, 'form');
    }
    this.setLock(key, null);
    return { id: acc.id, username: acc.display, dek: await importDek(raw), raw };
  }

  async changePassword(username: string, oldPw: string, newPw: string, confirm: string): Promise<void> {
    const key = normalizeUsername(username);
    const acc = this.accounts()[key];
    if (!acc) throw new AuthError('Không tìm thấy tài khoản.', 'form');
    const wait = this.lockedSeconds(key);
    if (wait > 0) throw new AuthError(`Đã nhập sai nhiều lần. Thử lại sau ${wait} giây.`, 'form');
    const raw = await this.unwrap(acc, oldPw);
    if (!raw) {
      const fails = (this.locks()[key]?.fails ?? 0) + 1;
      this.setLock(key, { fails, until: fails >= MAX_FAILS ? this.now() + 30_000 * 2 ** (fails - MAX_FAILS) : 0 });
      throw new AuthError('Mật khẩu hiện tại không đúng.', 'password');
    }
    const pe = validatePassword(newPw, username);
    if (pe) throw new AuthError(pe, 'confirm');
    if (newPw !== confirm) throw new AuthError('Mật khẩu mới nhập lại không khớp.', 'confirm');
    const salt = rand(16);
    const iv = rand(12);
    const k = await deriveKey(newPw, salt, this.iterations);
    const wrapped = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, raw));
    const all = this.accounts();
    all[key] = { ...acc, salt: b64(salt), iter: this.iterations, iv: b64(iv), wrapped: b64(wrapped) };
    this.saveAccounts(all);
    this.setLock(key, null);
  }

  async deleteAccount(username: string, password: string): Promise<void> {
    const key = normalizeUsername(username);
    const acc = this.accounts()[key];
    if (!acc) return;
    if (!(await this.unwrap(acc, password))) throw new AuthError('Mật khẩu không đúng.', 'password');
    const all = this.accounts();
    delete all[key];
    this.saveAccounts(all);
    this.kv.remove(this.dataKey(acc.id));
    this.kv.remove(`${this.dataKey(acc.id)}:backup`);
    this.setLock(key, null);
    this.session.remove(SESSION_KEY);
  }

  /* ----- Giữ phiên trong tab (sessionStorage, mất khi đóng tab) ----- */
  remember(s: Session) {
    this.session.set(SESSION_KEY, JSON.stringify({ id: s.id, raw: b64(s.raw) }));
  }
  async resume(): Promise<Session | null> {
    try {
      const o = JSON.parse(this.session.get(SESSION_KEY) || 'null') as { id?: string; raw?: string } | null;
      if (!o || typeof o.id !== 'string' || typeof o.raw !== 'string') return null;
      const entry = Object.values(this.accounts()).find((a) => a.id === o.id);
      if (!entry) return null;
      const raw = unb64(o.raw, 32);
      return { id: entry.id, username: entry.display, dek: await importDek(raw), raw };
    } catch {
      this.session.remove(SESSION_KEY);
      return null;
    }
  }
  logout(s?: Session | null) {
    s?.raw.fill(0);
    this.session.remove(SESSION_KEY);
  }
}

export function browserKV(store: Storage): KV {
  return {
    get: (k) => {
      try { return store.getItem(k); } catch { return null; }
    },
    set: (k, v) => store.setItem(k, v),
    remove: (k) => {
      try { store.removeItem(k); } catch { /* bỏ qua */ }
    },
  };
}
