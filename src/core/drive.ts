import type { AppData } from './types';
import { MAX_IMPORT_BYTES, sanitizeAppData } from './schema';

const FILE_NAME = 'diem-hoc-phan.json';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  constructor(message: string, public status: number) { super(message); this.name = 'DriveError'; }
}

export interface RemoteInfo { id: string; modifiedTime: string }
export interface RemoteDoc { data: AppData; savedAt: string }
export type FetchFn = typeof fetch;

async function call(f: FetchFn, token: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` }, cache: 'no-store', referrerPolicy: 'no-referrer' });
  } catch {
    throw new DriveError('Không kết nối được tới Google Drive. Kiểm tra mạng.', 0);
  }
  if (!res.ok) {
    const msg = res.status === 401 ? 'Phiên đăng nhập Google đã hết hạn.' : res.status === 403 ? 'Google từ chối quyền truy cập Drive (kiểm tra đã bật Google Drive API và cấp quyền).' : res.status === 429 ? 'Google báo quá nhiều yêu cầu, sẽ thử lại sau.' : `Google Drive trả lỗi ${res.status}.`;
    throw new DriveError(msg, res.status);
  }
  return res;
}

export async function findFile(f: FetchFn, token: string): Promise<RemoteInfo | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await call(f, token, `${API}/files?spaces=appDataFolder&q=${q}&fields=${encodeURIComponent('files(id,modifiedTime)')}&pageSize=1&orderBy=modifiedTime%20desc`);
  const j = (await res.json()) as { files?: { id?: unknown; modifiedTime?: unknown }[] };
  const x = j.files?.[0];
  if (!x || typeof x.id !== 'string' || typeof x.modifiedTime !== 'string') return null;
  if (!/^[\w-]{5,200}$/.test(x.id)) throw new DriveError('Phản hồi từ Google Drive không hợp lệ.', 0);
  return { id: x.id, modifiedTime: x.modifiedTime };
}

export function parseRemote(text: string): RemoteDoc {
  if (text.length > MAX_IMPORT_BYTES) throw new DriveError('Dữ liệu trên Drive quá lớn.', 0);
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new DriveError('Dữ liệu trên Drive không đọc được.', 0); }
  if (typeof raw !== 'object' || raw === null || !('data' in raw)) throw new DriveError('Dữ liệu trên Drive không đúng định dạng.', 0);
  const o = raw as { data: unknown; savedAt?: unknown };
  const { data } = sanitizeAppData(o.data);
  return { data, savedAt: typeof o.savedAt === 'string' ? o.savedAt.slice(0, 40) : '' };
}

export async function download(f: FetchFn, token: string, id: string): Promise<RemoteDoc> {
  const res = await call(f, token, `${API}/files/${encodeURIComponent(id)}?alt=media`);
  return parseRemote(await res.text());
}

const body = (data: AppData) => JSON.stringify({ app: 'diem-hoc-phan', version: 1, savedAt: new Date().toISOString(), data });

export async function create(f: FetchFn, token: string, data: AppData): Promise<RemoteInfo> {
  const boundary = `diem${Math.random().toString(36).slice(2)}${Date.now()}`;
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'], mimeType: 'application/json' });
  const payload = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${body(data)}\r\n--${boundary}--`;
  const res = await call(f, token, `${UPLOAD}/files?uploadType=multipart&fields=id,modifiedTime`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: payload });
  const j = (await res.json()) as { id?: string; modifiedTime?: string };
  if (typeof j.id !== 'string' || typeof j.modifiedTime !== 'string') throw new DriveError('Phản hồi từ Google Drive không hợp lệ.', 0);
  return { id: j.id, modifiedTime: j.modifiedTime };
}

export async function update(f: FetchFn, token: string, id: string, data: AppData): Promise<RemoteInfo> {
  const res = await call(f, token, `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=id,modifiedTime`, { method: 'PATCH', headers: { 'Content-Type': 'application/json; charset=UTF-8' }, body: body(data) });
  const j = (await res.json()) as { id?: string; modifiedTime?: string };
  if (typeof j.id !== 'string' || typeof j.modifiedTime !== 'string') throw new DriveError('Phản hồi từ Google Drive không hợp lệ.', 0);
  return { id: j.id, modifiedTime: j.modifiedTime };
}

export async function userInfo(f: FetchFn, token: string): Promise<{ name: string; email: string }> {
  const res = await call(f, token, 'https://www.googleapis.com/oauth2/v3/userinfo');
  const j = (await res.json()) as { name?: unknown; email?: unknown };
  const s = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F]/g, '').slice(0, 120) : '');
  return { name: s(j.name), email: s(j.email) };
}
