import type { AppData } from './types';
import { defaultData } from './defaults';
import { sanitizeAppData } from './schema';

/**
 * Lớp lưu trữ tách riêng để sau này gắn dịch vụ khác
 * chỉ cần viết thêm một adapter có cùng giao diện này.
 */
export interface StorageAdapter {
  load(): Promise<{ data: AppData; warnings: string[]; fresh: boolean }>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'diem-app:v1';
const BACKUP = 'diem-app:v1:backup';

export class LocalStorageAdapter implements StorageAdapter {
  async load() {
    try {
      const text = localStorage.getItem(KEY);
      if (!text) return { data: defaultData(), warnings: [], fresh: true };
      const r = sanitizeAppData(JSON.parse(text));
      return { ...r, fresh: false };
    } catch {
      // Dữ liệu hỏng: thử bản sao lưu gần nhất rồi mới về mặc định.
      try {
        const b = localStorage.getItem(BACKUP);
        if (b) {
          const r = sanitizeAppData(JSON.parse(b));
          return { data: r.data, warnings: ['Dữ liệu chính bị hỏng, đã khôi phục bản sao lưu gần nhất.', ...r.warnings], fresh: false };
        }
      } catch {
        /* bỏ qua */
      }
      return { data: defaultData(), warnings: ['Không đọc được dữ liệu đã lưu, đã bắt đầu lại từ trống.'], fresh: true };
    }
  }
  async save(data: AppData) {
    const text = JSON.stringify(data);
    const prev = localStorage.getItem(KEY);
    try {
      if (prev) localStorage.setItem(BACKUP, prev);
    } catch {
      /* sao lưu là phụ, không chặn việc lưu chính */
    }
    localStorage.setItem(KEY, text);
  }
  async clear() {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BACKUP);
  }
}
