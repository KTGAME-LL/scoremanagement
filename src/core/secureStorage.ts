import type { AppData } from './types';
import { defaultData } from './defaults';
import { sanitizeAppData } from './schema';
import { decryptJson, encryptJson, type KV } from './auth';
import type { StorageAdapter } from './storage';

/** Lưu dữ liệu của một tài khoản dưới dạng mã hóa AES-GCM, kèm một bản sao lưu gần nhất. */
export class SecureStorageAdapter implements StorageAdapter {
  private key: string;
  constructor(private kv: KV, userId: string, private dek: CryptoKey) {
    this.key = `diem-app:u:${userId}`;
  }

  private async read(k: string) {
    const text = this.kv.get(k);
    if (!text) return null;
    return sanitizeAppData(await decryptJson(this.dek, text));
  }

  async load() {
    try {
      const r = await this.read(this.key);
      if (!r) return { data: defaultData(), warnings: [], fresh: true };
      return { ...r, fresh: false };
    } catch {
      try {
        const b = await this.read(`${this.key}:backup`);
        if (b) return { data: b.data, warnings: ['Dữ liệu chính bị hỏng, đã khôi phục bản sao lưu gần nhất.', ...b.warnings], fresh: false };
      } catch {
        /* bỏ qua */
      }
      return { data: defaultData(), warnings: ['Không đọc được dữ liệu đã lưu, đã bắt đầu lại từ trống.'], fresh: true };
    }
  }

  async save(data: AppData) {
    const text = await encryptJson(this.dek, data);
    const prev = this.kv.get(this.key);
    if (prev) this.kv.set(`${this.key}:backup`, prev);
    this.kv.set(this.key, text);
  }

  async clear() {
    this.kv.remove(this.key);
    this.kv.remove(`${this.key}:backup`);
  }
}

/** Chuyển dữ liệu cũ (chưa mã hóa) của phiên bản trước vào tài khoản mới rồi xóa bản cũ. */
export async function migrateLegacy(kv: KV, adapter: SecureStorageAdapter): Promise<number> {
  const raw = kv.get('diem-app:v1') ?? kv.get('diem-app:v1:backup');
  if (!raw) return 0;
  try {
    const { data } = sanitizeAppData(JSON.parse(raw));
    await adapter.save(data);
    kv.remove('diem-app:v1');
    kv.remove('diem-app:v1:backup');
    return data.courses.length;
  } catch {
    return 0;
  }
}
