import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthService, browserKV, type Session } from '../core/auth';
import { SecureStorageAdapter, migrateLegacy } from '../core/secureStorage';

interface AuthApi {
  session: Session | null;
  ready: boolean;
  hasAccounts: boolean;
  hasLegacy: boolean;
  service: AuthService;
  adapter: SecureStorageAdapter | null;
  login: (u: string, p: string, remember: boolean) => Promise<void>;
  register: (u: string, p: string, c: string, remember: boolean, adoptLegacy: boolean) => Promise<void>;
  logout: () => void;
}
const Ctx = createContext<AuthApi | null>(null);
export const useAuth = (): AuthApi => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth cần nằm trong AuthProvider');
  return c;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const kv = useRef(browserKV(localStorage));
  const service = useMemo(() => new AuthService(kv.current, browserKV(sessionStorage)), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    service.resume().then((s) => {
      if (!alive) return;
      setSession(s);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [service]);

  const adapter = useMemo(() => (session ? new SecureStorageAdapter(kv.current, session.id, session.dek) : null), [session]);

  const login = useCallback(
    async (u: string, p: string, remember: boolean) => {
      const s = await service.login(u, p);
      if (remember) service.remember(s);
      setSession(s);
    },
    [service],
  );
  const register = useCallback(
    async (u: string, p: string, c: string, remember: boolean, adoptLegacy: boolean) => {
      const s = await service.register(u, p, c);
      if (adoptLegacy) await migrateLegacy(kv.current, new SecureStorageAdapter(kv.current, s.id, s.dek));
      if (remember) service.remember(s);
      setTick((x) => x + 1);
      setSession(s);
    },
    [service],
  );
  const logout = useCallback(() => {
    service.logout(session);
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
    login,
    register,
    logout,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
