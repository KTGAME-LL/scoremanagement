import type { AppData } from './types';
import * as drive from './drive';
import { NeedLoginError } from './google';

export type CloudStatus = 'signed-out' | 'connecting' | 'syncing' | 'synced' | 'needs-login' | 'error';
export interface CloudState { status: CloudStatus; message: string; lastSync: string | null }
export type Choice = 'remote' | 'local' | 'cancel';

export interface CloudHost {
  getLocal(): { data: AppData; hasData: boolean };
  applyRemote(data: AppData): void;
  choose(info: { remoteCourses: number; remoteSavedAt: string; localCourses: number }): Promise<Choice>;
  onState(s: CloudState): void;
}

/** Hai bản dữ liệu giống nhau về nội dung (so sánh JSON đã chuẩn hóa). */
export function sameData(a: AppData, b: AppData): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Đồng bộ một chiều có kiểm tra xung đột: dữ liệu trên máy luôn được lưu trước, rồi mới đẩy lên Drive.
 * Nếu bản trên Drive bị thiết bị khác đổi từ lần đồng bộ trước, hỏi người dùng chọn bản nào.
 */
export class CloudSync {
  private fileId: string | null = null;
  private knownModified: string | null = null;
  private state: CloudState = { status: 'signed-out', message: '', lastSync: null };
  private busy: Promise<void> = Promise.resolve();

  constructor(
    private host: CloudHost,
    private getToken: (interactive: boolean) => Promise<string>,
    private f: drive.FetchFn = (...a) => fetch(...a),
  ) {}

  private set(status: CloudStatus, message = '', lastSync = this.state.lastSync) {
    this.state = { status, message, lastSync };
    this.host.onState(this.state);
  }

  private queue<T>(job: () => Promise<T>): Promise<T> {
    const run = this.busy.then(job, job);
    this.busy = run.then(() => undefined, () => undefined);
    return run;
  }

  private fail(e: unknown) {
    if (e instanceof NeedLoginError || (e instanceof drive.DriveError && e.status === 401)) this.set('needs-login', e instanceof Error ? e.message : 'Cần đăng nhập lại.');
    else this.set('error', e instanceof Error ? e.message : 'Đồng bộ không thành công.');
  }

  /** Kết nối lần đầu sau khi có token: so sánh bản Drive và bản trên máy. */
  connect(interactive: boolean): Promise<void> {
    return this.queue(async () => {
      this.set('connecting', 'Đang kết nối Google Drive…');
      try {
        const token = await this.getToken(interactive);
        const info = await drive.findFile(this.f, token);
        const local = this.host.getLocal();
        if (!info) {
          const r = await drive.create(this.f, token, local.data);
          this.fileId = r.id; this.knownModified = r.modifiedTime;
          return this.set('synced', 'Đã tạo bản sao lưu trên Google Drive.', new Date().toISOString());
        }
        const remote = await drive.download(this.f, token, info.id);
        this.fileId = info.id; this.knownModified = info.modifiedTime;
        if (sameData(remote.data, local.data)) return this.set('synced', 'Đã đồng bộ.', new Date().toISOString());
        if (!local.hasData) {
          this.host.applyRemote(remote.data);
          return this.set('synced', 'Đã tải dữ liệu từ Google Drive.', new Date().toISOString());
        }
        if (remote.data.courses.length === 0) {
          const r = await drive.update(this.f, token, info.id, local.data);
          this.knownModified = r.modifiedTime;
          return this.set('synced', 'Đã sao lưu lên Google Drive.', new Date().toISOString());
        }
        const pick = await this.host.choose({ remoteCourses: remote.data.courses.length, remoteSavedAt: remote.savedAt, localCourses: local.data.courses.length });
        if (pick === 'cancel') return this.set('signed-out', '');
        if (pick === 'remote') this.host.applyRemote(remote.data);
        else this.knownModified = (await drive.update(this.f, token, info.id, local.data)).modifiedTime;
        this.set('synced', pick === 'remote' ? 'Đã dùng dữ liệu từ Google Drive.' : 'Đã ghi dữ liệu máy này lên Google Drive.', new Date().toISOString());
      } catch (e) {
        this.fail(e);
      }
    });
  }

  /** Đẩy dữ liệu hiện tại lên Drive (gọi sau khi đã lưu trên máy). */
  push(): Promise<void> {
    return this.queue(async () => {
      if (this.state.status === 'signed-out' || this.state.status === 'connecting') return;
      this.set('syncing', 'Đang đồng bộ…');
      try {
        const token = await this.getToken(false);
        const info = await drive.findFile(this.f, token);
        const local = this.host.getLocal();
        if (info && this.fileId === info.id && this.knownModified !== null && info.modifiedTime !== this.knownModified) {
          const remote = await drive.download(this.f, token, info.id);
          if (!sameData(remote.data, local.data)) {
            const pick = await this.host.choose({ remoteCourses: remote.data.courses.length, remoteSavedAt: remote.savedAt, localCourses: local.data.courses.length });
            if (pick === 'cancel') { this.knownModified = info.modifiedTime; return this.set('error', 'Đã tạm dừng đồng bộ vì dữ liệu hai nơi khác nhau.'); }
            if (pick === 'remote') { this.knownModified = info.modifiedTime; this.host.applyRemote(remote.data); return this.set('synced', 'Đã dùng dữ liệu từ Google Drive.', new Date().toISOString()); }
          }
        }
        const r = info ? await drive.update(this.f, token, info.id, local.data) : await drive.create(this.f, token, local.data);
        this.fileId = r.id; this.knownModified = r.modifiedTime;
        this.set('synced', 'Đã đồng bộ.', new Date().toISOString());
      } catch (e) {
        this.fail(e);
      }
    });
  }

  /** Khi quay lại tab: nếu thiết bị khác đã đổi dữ liệu và máy này chưa sửa gì thì tự cập nhật. */
  pull(localDirty: boolean): Promise<void> {
    return this.queue(async () => {
      if (this.state.status !== 'synced' || !this.fileId) return;
      try {
        const token = await this.getToken(false);
        const info = await drive.findFile(this.f, token);
        if (!info || info.modifiedTime === this.knownModified) return;
        if (localDirty) return; // push sẽ xử lý xung đột
        const remote = await drive.download(this.f, token, info.id);
        this.knownModified = info.modifiedTime;
        if (!sameData(remote.data, this.host.getLocal().data)) this.host.applyRemote(remote.data);
        this.set('synced', 'Đã cập nhật từ Google Drive.', new Date().toISOString());
      } catch (e) {
        this.fail(e);
      }
    });
  }

  disconnect() {
    this.fileId = null; this.knownModified = null;
    this.set('signed-out', '', null);
  }
}
