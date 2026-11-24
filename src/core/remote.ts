/** Máy khách cho kho dữ liệu mã hóa trên Supabase (chỉ gọi 3 hàm RPC, xem supabase/setup.sql). */
import { normalizeUsername, PBKDF2_ITERATIONS } from './auth';

const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b as ArrayBuffer), (x) => x.toString(16).padStart(2, '0')).join('');

/** Định danh kho trên máy chủ: băm của tên đăng nhập (máy chủ không thấy tên thật). */
export async function remoteId(username: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', enc.encode(`diem-id:v1:${normalizeUsername(username)}`)));
}

/** Token chứng minh biết mật khẩu. Khác hẳn khóa mã hóa dữ liệu nên máy chủ không suy ra được dữ liệu. */
export async function remoteToken(username: string, password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(`diem-token:v1:${normalizeUsername(username)}`), iterations },
    base,
    256,
  );
  return hex(bits);
}

export type RemoteStatus = 'ok' | 'denied' | 'locked' | 'conflict';
export interface RemoteResult { status: RemoteStatus; version?: number; blob?: string }

export class RemoteError extends Error {}

export class VaultClient {
  constructor(private url: string, private key: string, private fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  private async rpc(name: string, body: Record<string, unknown>): Promise<RemoteResult> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20_000);
    try {
      const headers: Record<string, string> = { apikey: this.key, 'Content-Type': 'application/json' };
      if (this.key.startsWith('eyJ')) headers.Authorization = `Bearer ${this.key}`;
      const res = await this.fetchFn(`${this.url}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(body), signal: ctl.signal });
      if (!res.ok) throw new RemoteError(`http-${res.status}`);
      const o = (await res.json()) as RemoteResult;
      if (!o || !['ok', 'denied', 'locked', 'conflict'].includes(o.status)) throw new RemoteError('bad-response');
      if (o.version !== undefined && !Number.isSafeInteger(o.version)) throw new RemoteError('bad-response');
      if (o.blob !== undefined && typeof o.blob !== 'string') throw new RemoteError('bad-response');
      return o;
    } catch (e) {
      throw e instanceof RemoteError ? e : new RemoteError('network');
    } finally {
      clearTimeout(timer);
    }
  }

  get(id: string, token: string) {
    return this.rpc('vault_get', { p_id: id, p_token: token });
  }
  put(id: string, token: string, expected: number, blob: string, newToken?: string) {
    return this.rpc('vault_put', { p_id: id, p_token: token, p_expected: expected, p_blob: blob, p_new_token: newToken ?? null });
  }
  delete(id: string, token: string) {
    return this.rpc('vault_delete', { p_id: id, p_token: token });
  }
}
