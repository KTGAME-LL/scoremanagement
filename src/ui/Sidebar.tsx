import { useStore, type SaveState, type Theme } from '../state/store';
import { useAuth } from '../state/auth';
import { useConfirm } from './Confirm';
import { toCsv } from '../core/exporters';
import { download, downloadBytes, stamp } from './format';
import { toXlsx } from '../core/excelExport';

const SAVE_TEXT: Record<SaveState, string> = {
  saving: 'Đang tự lưu…',
  saved: 'Đã tự lưu trên máy này',
  error: 'Không lưu được. Hãy xuất tệp dự phòng',
};
const SYNC_TEXT: Record<string, string> = {
  off: 'Chưa đồng bộ',
  idle: 'Chờ đồng bộ',
  syncing: 'Đang đồng bộ…',
  synced: 'Đã đồng bộ giữa các máy',
  offline: 'Mất mạng, sẽ đồng bộ lại sau',
  conflict: 'Đã nhận dữ liệu từ máy khác',
  error: 'Lỗi đồng bộ',
};
const THEME_NEXT: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' };
const THEME_TEXT: Record<Theme, string> = { auto: 'Theo hệ thống', light: 'Sáng', dark: 'Tối' };

export function Sidebar() {
  const st = useStore();
  const auth = useAuth();
  const confirm = useConfirm();
  const { ui, data } = st;

  const nav = (view: 'overview' | 'course' | 'targets' | 'program' | 'help' | 'settings', label: string, count?: number) => (
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
        {nav('program', 'Chương trình đào tạo')}
        {nav('settings', 'Cấu hình')}
        {nav('help', 'Hướng dẫn')}
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

      <div className="group tools" role="group" aria-label="Tài khoản">
        <h2>Tài khoản</h2>
        <p className="account-line" title={auth.session?.username}>{auth.session?.username}</p>
        <button className="tool" onClick={() => st.go('settings', null, 'account-card')}>Đổi mật khẩu</button>
        <button className="tool" onClick={() => { st.flushNow().then(auth.logout); }}>Đăng xuất</button>
      </div>

      <div className="group tools" role="group" aria-label="Dữ liệu">
        <h2>Dữ liệu</h2>
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
            if (await confirm('Xóa toàn bộ dữ liệu của tài khoản này? Hãy xuất Excel để giữ một bản trước nếu cần.', 'Xóa tất cả', true)) {
              await st.resetAll();
              st.notify('Đã xóa dữ liệu.');
            }
          }}
        >
          Xóa toàn bộ dữ liệu
        </button>
      </div>

      {auth.sync.enabled && (
        <p className={`save sync ${auth.sync.state}`} role="status" title={auth.sync.detail}>
          <span className="dot" aria-hidden="true" /> {SYNC_TEXT[auth.sync.state]}{auth.sync.detail ? `: ${auth.sync.detail}` : ''}
        </p>
      )}
      <p className={`save ${st.saveState}`} role="status" aria-live="polite">
        <span className="dot" aria-hidden="true" /> {SAVE_TEXT[st.saveState]}
      </p>
    </aside>
  );
}
