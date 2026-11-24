/**
 * Đồng bộ dữ liệu mã hóa giữa các máy qua kho Supabase.
 * - Luôn lưu trên máy trước; đẩy lên mạng sau (debounce), mất mạng thì thử lại.
 * - Mỗi bản có số phiên bản; ghi sai phiên bản bị máy chủ từ chối (không ghi đè dữ liệu của máy khác).
 * - Khi xung đột: lấy bản của máy chủ, bản cục bộ được giữ lại ở khóa ":conflict".
 */
import { decryptJson, type AccountFields, type KV } from './auth';
import { RemoteError, type VaultClient } from './remote';

export type SyncState = 'off' | 'idle' | 'syncing' | 'synced' | 'offline' | 'conflict' | 'error';

interface Meta { version: number; dirty: boolean }
interface Blob { v: 1; acc: AccountFields; data: string }

export class SyncEngine {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private again = false;
  private stopped = false;

  constructor(
    private kv: KV,
    private client: VaultClient,
    private o: {
      userId: string;
      rid: string;
      getToken: () => string;
      getAccount: () => AccountFields | null;
      dek: CryptoKey;
      onState: (s: SyncState, detail?: string) => void;
      onRemoteApplied: () => void;
      debounceMs?: number;
    },
  ) {}

  private get dataKey() { return `diem-app:u:${this.o.userId}`; }
  private get metaKey() { return `diem-app:sync:${this.o.userId}`; }
  meta(): Meta {
    try {
      const m = JSON.parse(this.kv.get(this.metaKey) || 'null') as Meta | null;
      if (m && Number.isSafeInteger(m.version) && m.version >= 0) return { version: m.version, dirty: !!m.dirty };
    } catch { /* bỏ qua */ }
    return { version: 0, dirty: false };
  }
  private setMeta(m: Meta) { this.kv.set(this.metaKey, JSON.stringify(m)); }

  stop() { this.stopped = true; clearTimeout(this.timer); }

  /** Gọi sau mỗi lần lưu cục bộ. */
  markDirty() {
    const m = this.meta();
    this.setMeta({ ...m, dirty: true });
    this.o.onState('idle');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.sync(), this.o.debounceMs ?? 1500);
  }

  private blob(): string | null {
    const acc = this.o.getAccount();
    const data = this.kv.get(this.dataKey);
    if (!acc || !data) return null;
    const b: Blob = { v: 1, acc, data };
    return JSON.stringify(b);
  }

  private async applyRemote(version: number, text: string): Promise<boolean> {
    const b = JSON.parse(text) as Blob;
    if (b.v !== 1 || typeof b.data !== 'string') throw new Error('bad-blob');
    await decryptJson(this.o.dek, b.data); // phải giải được bằng khóa của tài khoản này
    const local = this.kv.get(this.dataKey);
    if (local && local !== b.data && this.meta().dirty) this.kv.set(`${this.dataKey}:conflict`, local);
    if (local) this.kv.set(`${this.dataKey}:backup`, local);
    this.kv.set(this.dataKey, b.data);
    this.setMeta({ version, dirty: false });
    return true;
  }

  /** Kéo bản mới (nếu có) rồi đẩy bản cục bộ chưa gửi. Trả về true nếu đã nhận dữ liệu từ máy chủ. */
  async sync(): Promise<boolean> {
    if (this.stopped) return false;
    if (this.running) { this.again = true; return false; }
    this.running = true;
    let applied = false;
    try {
      this.o.onState('syncing');
      const token = this.o.getToken();
      for (let attempt = 0; attempt < 3; attempt++) {
        const m = this.meta();
        const r = await this.client.get(this.o.rid, token);
        if (r.status === 'locked') { this.o.onState('error', 'Máy chủ tạm khóa do thử sai nhiều lần.'); return applied; }
        if (r.status === 'denied' && m.version === 0) {
          // Chưa có kho trên máy chủ (tài khoản tạo khi chưa đồng bộ): tạo mới. Nếu tên đã bị dùng thì bị từ chối.
          const blob = this.blob();
          const c = blob ? await this.client.put(this.o.rid, token, 0, blob) : null;
          if (c && c.status === 'ok' && c.version !== undefined) { this.setMeta({ version: c.version, dirty: false }); break; }
        }
        if (r.status === 'denied') { this.o.onState('error', 'Máy chủ không nhận tài khoản này (mật khẩu đã đổi ở máy khác? hãy đăng nhập lại).'); return applied; }
        if (r.status !== 'ok' || r.version === undefined || r.blob === undefined) throw new RemoteError('bad-response');
        if (r.version > m.version) {
          const hadLocalChanges = m.dirty;
          await this.applyRemote(r.version, r.blob);
          applied = true;
          this.o.onRemoteApplied();
          if (hadLocalChanges) { this.o.onState('conflict', 'Có thay đổi từ máy khác. Đã dùng bản mới nhất; bản trên máy này được giữ làm dự phòng.'); return applied; }
          break;
        }
        if (!m.dirty) break;
        const blob = this.blob();
        if (!blob) break;
        const w = await this.client.put(this.o.rid, token, m.version, blob);
        if (w.status === 'ok' && w.version !== undefined) { this.setMeta({ version: w.version, dirty: false }); break; }
        if (w.status === 'conflict') continue; // vòng sau sẽ kéo bản mới
        this.o.onState('error', w.status === 'locked' ? 'Máy chủ tạm khóa.' : 'Máy chủ từ chối ghi.');
        return applied;
      }
      this.o.onState('synced');
    } catch (e) {
      this.o.onState(e instanceof RemoteError || e instanceof TypeError ? 'offline' : 'error', e instanceof RemoteError ? undefined : 'Dữ liệu từ máy chủ không hợp lệ, đã bỏ qua.');
      if (!this.stopped) { clearTimeout(this.timer); this.timer = setTimeout(() => void this.sync(), 30_000); }
    } finally {
      this.running = false;
      if (this.again && !this.stopped) { this.again = false; void this.sync(); }
    }
    return applied;
  }
}
