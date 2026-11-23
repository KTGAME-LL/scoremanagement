import { useEffect } from 'react';
import { StoreProvider, useStore } from '../state/store';
import { ConfirmProvider } from './Confirm';
import { Sidebar } from './Sidebar';
import { Overview } from './Overview';
import { CourseView } from './CourseView';
import { SettingsView } from './SettingsView';
import { TargetsView } from './TargetsView';

function Shell() {
  const st = useStore();
  const { undo, redo } = st;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  if (!st.ready) return <div className="loading" role="status">Đang tải dữ liệu…</div>;

  return (
    <div className="app">
      <Sidebar />
      <main className="main" id="main">
        {st.warnings.length > 0 && st.ui.view === 'overview' && (
          <div className="banner warn" role="note">Dữ liệu đã được chuẩn hóa khi tải: {st.warnings.slice(0, 2).join(' ')}</div>
        )}
        {st.google.linked && st.cloud.status === 'needs-login' && (
          <div className="banner warn" role="alert">
            Phiên Google đã hết hạn nên chưa đồng bộ được (dữ liệu vẫn tự lưu trên máy). {st.cloud.message}
            <button className="btn" onClick={() => void st.googleSignIn()}>Đăng nhập lại</button>
          </div>
        )}
        {st.google.linked && st.cloud.status === 'error' && (
          <div className="banner warn" role="alert">Chưa đồng bộ được với Google Drive: {st.cloud.message} Dữ liệu vẫn tự lưu trên máy.</div>
        )}
        {st.ui.view === 'overview' && <Overview />}
        {st.ui.view === 'course' && <CourseView />}
        {st.ui.view === 'targets' && <TargetsView />}
        {st.ui.view === 'settings' && <SettingsView />}
      </main>
      {st.toast && <div className="toast" role="status" aria-live="polite">{st.toast}</div>}
    </div>
  );
}

export function App() {
  return (
    <ConfirmProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </ConfirmProvider>
  );
}
