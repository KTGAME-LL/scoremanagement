/**
 * Đăng nhập Google bằng Google Identity Services (token model).
 * Chỉ xin quyền: tên + email (hiển thị người đăng nhập) và thư mục dữ liệu ẩn của ứng dụng
 * trên Google Drive (drive.appdata). Ứng dụng không đọc được các tệp khác của bạn.
 */

export const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.appdata';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const CLIENT_ID_RE = /^[0-9]{6,}-[a-z0-9]{8,}\.apps\.googleusercontent\.com$/i;
const GIS_URL = 'https://accounts.google.com/gsi/client';

export function isValidClientId(id: string): boolean {
  return id.length <= 200 && CLIENT_ID_RE.test(id);
}

/** Google chỉ cho đăng nhập từ địa chỉ https (hoặc localhost), không phải từ tệp mở trực tiếp. */
export function originSupported(loc: Pick<Location, 'protocol' | 'hostname'> = location): boolean {
  if (loc.protocol === 'https:') return true;
  return loc.protocol === 'http:' && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  scope?: string;
}
interface TokenClient {
  requestAccessToken(cfg?: { prompt?: string; hint?: string }): void;
}
interface GoogleOAuth2 {
  initTokenClient(cfg: {
    client_id: string;
    scope: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(r: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}
function oauth(): GoogleOAuth2 | undefined {
  return (window as unknown as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google?.accounts?.oauth2;
}

let gis: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  if (oauth()) return Promise.resolve();
  if (gis) return gis;
  gis = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_URL;
    s.async = true;
    const timer = window.setTimeout(() => { gis = null; reject(new Error('Không tải được dịch vụ đăng nhập của Google (hết thời gian chờ).')); }, 15000);
    s.onload = () => { window.clearTimeout(timer); oauth() ? resolve() : (gis = null, reject(new Error('Dịch vụ đăng nhập của Google không sẵn sàng.'))); };
    s.onerror = () => { window.clearTimeout(timer); gis = null; reject(new Error('Không tải được dịch vụ đăng nhập của Google. Kiểm tra kết nối mạng.')); };
    document.head.appendChild(s);
  });
  return gis;
}

export class NeedLoginError extends Error {
  constructor(message = 'Cần đăng nhập Google lại.') { super(message); this.name = 'NeedLoginError'; }
}

export class GoogleAuth {
  private client: TokenClient | null = null;
  private token: string | null = null;
  private expiresAt = 0;
  private pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;
  hint = '';

  constructor(private clientId: string) {}

  async init(): Promise<void> {
    if (this.client) return;
    await loadGis();
    const o = oauth() as GoogleOAuth2;
    this.client = o.initTokenClient({
      client_id: this.clientId,
      scope: SCOPES,
      callback: (r) => {
        const p = this.pending;
        this.pending = null;
        if (!p) return;
        if (r.error || typeof r.access_token !== 'string' || !r.access_token) return p.reject(new NeedLoginError(r.error === 'access_denied' ? 'Bạn đã từ chối quyền truy cập.' : 'Đăng nhập Google không thành công.'));
        if (!o.hasGrantedAllScopes(r, DRIVE_SCOPE)) return p.reject(new NeedLoginError('Cần cấp quyền lưu dữ liệu trên Google Drive (đừng bỏ chọn ô quyền Drive).'));
        const ttl = Math.max(60, Math.min(3600, Number(r.expires_in) || 3600));
        this.token = r.access_token;
        this.expiresAt = Date.now() + (ttl - 60) * 1000;
        p.resolve(r.access_token);
      },
      error_callback: (e) => {
        const p = this.pending;
        this.pending = null;
        p?.reject(new NeedLoginError(e?.type === 'popup_closed' ? 'Cửa sổ đăng nhập đã bị đóng.' : e?.type === 'popup_failed_to_open' ? 'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên.' : 'Đăng nhập Google không thành công.'));
      },
    });
  }

  private request(prompt: string, waitMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.client) return reject(new NeedLoginError('Chưa khởi tạo đăng nhập.'));
      this.pending?.reject(new NeedLoginError('Yêu cầu đăng nhập mới thay thế yêu cầu cũ.'));
      let timer = 0;
      const mine = {
        resolve: (t: string) => { window.clearTimeout(timer); resolve(t); },
        reject: (e: Error) => { window.clearTimeout(timer); reject(e); },
      };
      this.pending = mine;
      timer = window.setTimeout(() => {
        if (this.pending === mine) { this.pending = null; mine.reject(new NeedLoginError('Hết thời gian chờ đăng nhập.')); }
      }, waitMs);
      this.client.requestAccessToken({ prompt, ...(this.hint ? { hint: this.hint } : {}) });
    });
  }

  hasToken(): boolean { return !!this.token && Date.now() < this.expiresAt; }

  /** Đăng nhập có tương tác (mở cửa sổ Google khi cần chọn tài khoản/cấp quyền). */
  async signIn(): Promise<string> {
    await this.init();
    return this.request(this.hint ? '' : 'select_account', 180000);
  }

  /** Lấy token hợp lệ; nếu hết hạn thì thử làm mới êm (không hỏi lại nếu Google cho phép). */
  async getToken(interactive = false): Promise<string> {
    if (this.hasToken()) return this.token as string;
    await this.init();
    return this.request(interactive ? '' : 'none', interactive ? 180000 : 15000);
  }

  invalidate(): void { this.token = null; this.expiresAt = 0; }

  signOut(): void {
    const t = this.token;
    this.invalidate();
    if (t) oauth()?.revoke(t);
  }
}
