import { useEffect } from 'react';
import { StoreProvider, useStore } from '../state/store';
import { AuthProvider, useAuth } from '../state/auth';
import { AuthScreen } from './AuthScreen';
import { ConfirmProvider } from './Confirm';
import { Sidebar } from './Sidebar';
import { Overview } from './Overview';
import { CourseView } from './CourseView';
import { SettingsView } from './SettingsView';
import { TargetsView } from './TargetsView';
import { ProgramView } from './ProgramView';
import { HelpView } from './HelpView';

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
        {st.ui.view === 'overview' && <Overview />}
        {st.ui.view === 'course' && <CourseView />}
        {st.ui.view === 'targets' && <TargetsView />}
        {st.ui.view === 'program' && <ProgramView />}
        {st.ui.view === 'help' && <HelpView />}
        {st.ui.view === 'settings' && <SettingsView />}
      </main>
      {st.toast && <div className="toast" role="status" aria-live="polite">{st.toast}</div>}
    </div>
  );
}

function Gate() {
  const auth = useAuth();
  if (!auth.ready) return <div className="loading" role="status">Đang tải…</div>;
  if (!auth.session || !auth.adapter) return <AuthScreen />;
  return (
    <StoreProvider key={auth.session.id} adapter={auth.adapter}>
      <Shell />
    </StoreProvider>
  );
}

export function App() {
  return (
    <ConfirmProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ConfirmProvider>
  );
}
