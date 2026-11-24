import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthError, AuthService, browserKV, type AccountFields, type KV, type Session } from '../core/auth';
import { SecureStorageAdapter, migrateLegacy } from '../core/secureStorage';
import { defaultData } from '../core/defaults';
import type { AppData } from '../core/types';
import type { StorageAdapter } from '../core/storage';
import { RemoteError, VaultClient, remoteId, remoteToken } from '../core/remote';
import { SyncEngine, type SyncState } from '../core/sync';
import cfg from '../syncConfig.json';

const SYNC_ENABLED = !!cfg.url && !!cfg.anonKey;
const TOKEN_KEY = 'diem-app:sync-token:v1';

interface AuthApi {
  session: Session | null;
  ready: boolean;
  hasAccounts: boolean;
  hasLegacy: boolean;
  service: AuthService;
  adapter: StorageAdapter | null;
  epoch: number;
  sync: { enabled: boolean; state: SyncState; detail?: string; now: () => void };
  login: (u: string, p: string, remember: boolean) => Promise<void>;
  register: (u: string, p: string, c: string, remember: boolean, adoptLegacy: boolean) => Promise<void>;
  changePassword: (oldPw: string, newPw: string, confirm: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthApi | null>(null);
export const useAuth = (): AuthApi => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth cần nằm trong AuthProvider');
  return c;
};

const NET_MSG = 'Không kết nối được máy chủ đồng bộ. Hãy kiểm tra mạng rồi thử lại.';

/** Bọc bộ lưu trữ mã hóa: sau mỗi lần lưu cục bộ thì báo cho bộ đồng bộ. */
class SyncingAdapter implements StorageAdapter {
  constructor(private inner: SecureStorageAdapter, private engine: () => SyncEngine | null) {}
  load() { return this.inner.load(); }
  async save(d: AppData) { await this.inner.save(d); this.engine()?.markDirty(); }
  clear() { return this.inner.clear(); }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const kv = useRef(browserKV(localStorage));
  const sessKv = useRef<KV>(browserKV(sessionStorage));
  const service = useMemo(() => new AuthService(kv.current, sessKv.current), []);
  const client = useMemo(() => (SYNC_ENABLED ? new VaultClient(cfg.url, cfg.anonKey) : null), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [epoch, setEpoch] = useState(0);
  const [syncState, setSyncState] = useState<{ state: SyncState; detail?: string }>({ state: SYNC_ENABLED ? 'idle' : 'off' });
  const tokenRef = useRef<string | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);

  useEffect(() => {
    let alive = true;
    service.resume().then((s) => {
      if (!alive) return;
      if (s) tokenRef.current = sessKv.current.get(TOKEN_KEY);
      setSession(s);
      setReady(true);
    });
    return () => { alive = false; };
  }, [service]);

  const adapter = useMemo(() => {
    if (!session) return null;
    return new SyncingAdapter(new SecureStorageAdapter(kv.current, session.id, session.dek), () => engineRef.current);
  }, [session]);

  // Bộ đồng bộ: chạy khi có phiên và có token (đăng nhập bằng mật khẩu trong tab này).
  useEffect(() => {
    engineRef.current = null;
    if (!session || !client) return;
    const token = tokenRef.current;
    if (!token) { setSyncState({ state: 'off', detail: 'Đăng nhập lại để bật đồng bộ.' }); return; }
    let eng: SyncEngine | null = null;
    let stopped = false;
    void remoteId(session.username).then((rid) => {
      if (stopped) return;
      eng = new SyncEngine(kv.current, client, {
        userId: session.id,
        rid,
        getToken: () => tokenRef.current ?? token,
        getAccount: () => service.exportAccount(session.username),
        dek: session.dek,
        onState: (state, detail) => setSyncState({ state, detail }),
        onRemoteApplied: () => setEpoch((e) => e + 1),
      });
      engineRef.current = eng;
      void eng.sync();
    });
    const onVisible = () => { if (document.visibilityState === 'visible') void eng?.sync(); };
    const onOnline = () => void eng?.sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      stopped = true;
      eng?.stop();
      engineRef.current = null;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [session, client, service]);

  const keepToken = (remember: boolean, token: string | null) => {
    tokenRef.current = token;
    if (remember && token) sessKv.current.set(TOKEN_KEY, token);
  };

  const blobOf = (id: string, acc: AccountFields): string | null => {
    const data = kv.current.get(`diem-app:u:${id}`);
    return data ? JSON.stringify({ v: 1, acc, data }) : null;
  };
  const setMeta = (id: string, version: number, dirty: boolean) => kv.current.set(`diem-app:sync:${id}`, JSON.stringify({ version, dirty }));

  const login = useCallback(async (u: string, p: string, remember: boolean) => {
    let s: Session | null = null;
    let localErr: unknown = null;
    try { s = await service.login(u, p); } catch (e) { localErr = e; if (!client || !(e instanceof AuthError)) throw e; }
    let token: string | null = null;
    if (client) {
      try { token = await remoteToken(u, p); } catch { token = null; }
    }
    if (!s) {
      // Không khớp trên máy này: thử tài khoản trên máy chủ (đăng nhập lần đầu trên máy mới, hoặc mật khẩu đã đổi ở máy khác).
      if (!client || !token || service.lockedSeconds(u) > 0) throw localErr;
      let r;
      try { r = await client.get(await remoteId(u), token); } catch { throw new AuthError(`${NET_MSG} (Nếu đây là máy mới, cần có mạng để lấy tài khoản.)`, 'form'); }
      if (r.status !== 'ok' || !r.blob || r.version === undefined) throw localErr;
      try {
        const b = JSON.parse(r.blob) as { v: number; acc: AccountFields; data: string };
        const raw = await service.unwrapFields(b.acc, p);
        if (b.v !== 1 || !raw || typeof b.data !== 'string') throw localErr;
        s = await service.importAccount(u, b.acc, raw);
        kv.current.set(`diem-app:u:${s.id}`, b.data);
        setMeta(s.id, r.version, false);
      } catch (e) {
        if (e instanceof AuthError) throw e;
        throw localErr;
      }
    }
    if (remember) service.remember(s);
    keepToken(remember, token);
    setSession(s);
  }, [service, client]);

  const register = useCallback(async (u: string, p: string, c: string, remember: boolean, adoptLegacy: boolean) => {
    const s = await service.register(u, p, c);
    const local = new SecureStorageAdapter(kv.current, s.id, s.dek);
    if (adoptLegacy) await migrateLegacy(kv.current, local);
    if (!kv.current.get(`diem-app:u:${s.id}`)) await local.save(defaultData());
    let token: string | null = null;
    if (client) {
      token = await remoteToken(u, p);
      const acc = service.exportAccount(u);
      const blob = acc ? blobOf(s.id, acc) : null;
      try {
        const w = await client.put(await remoteId(u), token, 0, blob ?? '{}');
        if (w.status !== 'ok') {
          service.removeLocal(u);
          throw new AuthError('Tên đăng nhập này đã được dùng. Hãy chọn tên khác, hoặc đăng nhập nếu đó là tài khoản của bạn.', 'username');
        }
        setMeta(s.id, w.version ?? 1, false);
      } catch (e) {
        if (e instanceof AuthError) throw e;
        // Mất mạng: giữ tài khoản trên máy, sẽ tạo trên máy chủ ở lần đồng bộ sau.
        setMeta(s.id, 0, true);
      }
    }
    if (remember) service.remember(s);
    keepToken(remember, token);
    setTick((x) => x + 1);
    setSession(s);
  }, [service, client]);

  const changePassword = useCallback(async (oldPw: string, newPw: string, confirm: string) => {
    if (!session) return;
    const name = session.username;
    if (!client) return service.changePassword(name, oldPw, newPw, confirm);
    const oldToken = await remoteToken(name, oldPw);
    const rid = await remoteId(name);
    await service.changePassword(name, oldPw, newPw, confirm, async (fields) => {
      const newToken = await remoteToken(name, newPw);
      const blob = blobOf(session.id, fields);
      const ver = JSON.parse(kv.current.get(`diem-app:sync:${session.id}`) || '{"version":0}').version as number;
      try {
        const w = ver === 0 ? await client.put(rid, newToken, 0, blob ?? '{}') : await client.put(rid, oldToken, ver, blob ?? '{}', newToken);
        if (w.status === 'conflict') throw new AuthError('Dữ liệu vừa thay đổi ở máy khác. Chờ đồng bộ xong rồi đổi mật khẩu lại.', 'form');
        if (w.status !== 'ok') throw new AuthError('Máy chủ từ chối đổi mật khẩu. Hãy đăng xuất, đăng nhập lại rồi thử lại.', 'form');
        setMeta(session.id, w.version ?? ver + 1, false);
        keepToken(sessKv.current.get(TOKEN_KEY) !== null, newToken);
      } catch (e) {
        if (e instanceof AuthError) throw e;
        if (e instanceof RemoteError) throw new AuthError('Cần có mạng để đổi mật khẩu khi đang bật đồng bộ. Mật khẩu chưa bị thay đổi.', 'form');
        throw e;
      }
    });
  }, [service, client, session]);

  const deleteAccount = useCallback(async (password: string) => {
    if (!session) return;
    const name = session.username;
    if (client) {
      const token = await remoteToken(name, password);
      try {
        await client.delete(await remoteId(name), token);
      } catch {
        throw new AuthError('Cần có mạng để xóa tài khoản khi đang bật đồng bộ.', 'password');
      }
    }
    await service.deleteAccount(name, password);
    engineRef.current?.stop();
    tokenRef.current = null;
    sessKv.current.remove(TOKEN_KEY);
    setSession(null);
    setTick((x) => x + 1);
  }, [service, client, session]);

  const logout = useCallback(() => {
    engineRef.current?.stop();
    service.logout(session);
    tokenRef.current = null;
    sessKv.current.remove(TOKEN_KEY);
    setSession(null);
    setTick((x) => x + 1);
  }, [service, session]);

  const value: AuthApi = {
    session,
    ready,
    hasAccounts: (void tick, service.hasAccounts()),
    hasLegacy: service.hasLegacyData(),
    service,
    adapter,
    epoch,
    sync: { enabled: SYNC_ENABLED, state: syncState.state, detail: syncState.detail, now: () => void engineRef.current?.sync() },
    login,
    register,
    changePassword,
    deleteAccount,
    logout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
