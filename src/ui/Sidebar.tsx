import { useRef } from 'react';
import { useStore, type SaveState, type Theme } from '../state/store';
import { useConfirm } from './Confirm';
import { toCsv, toJson } from '../core/exporters';
import { MAX_IMPORT_BYTES, parseImport } from '../core/schema';
import { download, downloadBytes, stamp } from './format';
import { toXlsx } from '../core/excelExport';
import type { CloudState } from '../core/cloudSync';

const SAVE_TEXT: Record<SaveState, string> = {
  saving: 'Đang tự lưu…',
  saved: 'Đã tự lưu trên máy này',
  error: 'Không lưu được. Hãy xuất tệp dự phòng',
};
const CLOUD_TEXT: Record<CloudState['status'], string> = {
  'signed-out': 'Chưa đồng bộ',
  connecting: 'Đang kết nối Google Drive',
  syncing: 'Đang đồng bộ',
  synced: 'Đã đồng bộ Google Drive',
  'needs-login': 'Cần đăng nhập lại',
  error: 'Lỗi đồng bộ',
};
const THEME_NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_TEXT: Record<Theme, string> = { auto: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' };

export function Sidebar() {
  const st = useStore();
  const confirm = useConfirm();
  const file = useRef<HTMLInputElement>(null);
  const { ui, data } = st;

  const nav = (view: 'overview' | 'course' | 'targets' | 'settings', label: string, count?: number) => (
    <button
      className={`nav ${ui.view === view ? 'on' : ''}`}
      aria-current={ui.view === view ? 'page' : undefined}
      onClick={() => {
        if (view === 'course' && !ui.courseId && data.courses.length) st.go('course', data.courses[0].id);
        else st.go(view);
      }}
    >
      <span>{label}</span>
      {count !== undefined && <span className="count">{count}</span>}
    </button>
  );

  const onImport = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) {
      st.notify('Tệp quá lớn (tối đa 2 MB).');
      return;
    }
    try {
      const r = parseImport(await f.text());
      const ok = await confirm(
        `Nhập ${r.data.courses.length} môn từ tệp? Dữ liệu hiện tại sẽ được thay thế (bạn vẫn có thể Hoàn tác).`,
        'Nhập dữ liệu',
      );
      if (!ok) return;
      st.replaceAll(r.data);
      st.notify(r.warnings.length ? `Đã nhập. Lưu ý: ${r.warnings[0]}` : 'Đã nhập dữ liệu.');
    } catch (e) {
      st.notify(e instanceof Error ? e.message : 'Không đọc được tệp.');
    }
  };

  return (
    <aside className="sidebar" aria-label="Công cụ">
      <div className="brand">
        <span className="logo" aria-hidden="true">Σ</span>
        <div>
          <strong>Điểm học phần</strong>
          <small>{data.settings.student.name || 'Tính điểm theo trọng số'}</small>
        </div>
      </div>

      <nav className="group" aria-label="Màn hình">
        {nav('overview', 'Tổng quan')}
        {nav('course', 'Môn học', data.courses.length)}
        {nav('targets', 'Mục tiêu điểm')}
        {nav('settings', 'Cấu hình')}
      </nav>

      <div className="group tools" role="group" aria-label="Công cụ">
        <h2>Công cụ</h2>
        <button className="tool" onClick={() => st.addCourse(ui.view === 'course' ? st.data.courses.find((c) => c.id === ui.courseId)?.term ?? 0 : 0)}>
          Thêm môn
        </button>
        <div className="pair">
          <button className="tool" onClick={st.undo} disabled={!st.canUndo} title="Ctrl+Z">Hoàn tác</button>
          <button className="tool" onClick={st.redo} disabled={!st.canRedo} title="Ctrl+Y">Làm lại</button>
        </div>
        <button className="tool" onClick={() => st.setTheme(THEME_NEXT[ui.theme])}>
          Giao diện: {THEME_TEXT[ui.theme]}
        </button>
      </div>

      <div className="group tools" role="group" aria-label="Tài khoản Google">
        <h2>Tài khoản Google</h2>
        {st.google.linked ? (
          <>
            <p className="who" title={st.google.user?.email}>{st.google.user?.name || st.google.user?.email || 'Đã đăng nhập'}</p>
            <p className={`cloud ${st.cloud.status}`} role="status" aria-live="polite">{CLOUD_TEXT[st.cloud.status]}{st.cloud.message && st.cloud.status !== 'synced' ? `: ${st.cloud.message}` : ''}</p>
            {st.cloud.status === 'needs-login' ? (
              <button className="tool" onClick={() => void st.googleSignIn()}>Đăng nhập lại để đồng bộ</button>
            ) : (
              <button className="tool" onClick={st.syncNow} disabled={st.cloud.status === 'syncing' || st.cloud.status === 'connecting'}>Đồng bộ ngay</button>
            )}
            <button className="tool" onClick={st.googleSignOut}>Đăng xuất</button>
          </>
        ) : !st.google.clientId ? (
          <button className="tool" onClick={() => st.go('settings', null, 'google-card')}>Thiết lập đăng nhập Google</button>
        ) : (
          <button className="tool" onClick={() => void st.googleSignIn()} disabled={!st.google.supported || st.cloud.status === 'connecting'} title={st.google.supported ? undefined : 'Cần mở qua địa chỉ https'}>
            Đăng nhập Google
          </button>
        )}
        {!st.google.supported && <p className="who small">Chỉ đăng nhập được khi mở qua địa chỉ https (xem README).</p>}
      </div>

      <div className="group tools" role="group" aria-label="Dữ liệu">
        <h2>Dữ liệu</h2>
        <button className="tool" onClick={() => download(`diem-hoc-phan-${stamp()}.json`, toJson(data), 'application/json')}>
          Xuất sao lưu (JSON)
        </button>
        <button className="tool" onClick={() => file.current?.click()}>Nhập từ JSON</button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            void onImport(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          className="tool"
          onClick={() => {
            try {
              downloadBytes(`bang-diem-${stamp()}.xlsx`, toXlsx(data), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            } catch {
              st.notify('Không tạo được tệp Excel.');
            }
          }}
        >
          Xuất Excel (.xlsx)
        </button>
        <button className="tool" onClick={() => download(`bang-diem-${stamp()}.csv`, toCsv(data), 'text/csv')}>
          Xuất bảng điểm (CSV)
        </button>
        <button
          className="tool warn"
          onClick={async () => {
            if (await confirm(st.google.linked ? 'Xóa toàn bộ dữ liệu? Vì đang đồng bộ Google, bản trên Google Drive cũng sẽ bị thay bằng dữ liệu trống. Hãy xuất sao lưu trước nếu cần.' : 'Xóa toàn bộ dữ liệu trên máy này? Hãy xuất sao lưu trước nếu cần.', 'Xóa tất cả', true)) {
              await st.resetAll();
              st.notify('Đã xóa dữ liệu.');
            }
          }}
        >
          Xóa toàn bộ dữ liệu
        </button>
      </div>

      <p className={`save ${st.saveState}`} role="status" aria-live="polite">
        <span className="dot" aria-hidden="true" /> {SAVE_TEXT[st.saveState]}
      </p>
    </aside>
  );
}
