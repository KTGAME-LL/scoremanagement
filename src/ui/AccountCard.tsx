import { useState, type FormEvent } from 'react';
import { useAuth } from '../state/auth';
import { useStore } from '../state/store';
import { useConfirm } from './Confirm';
import { AuthError, PASSWORD_MAX } from '../core/auth';

export function AccountCard() {
  const auth = useAuth();
  const st = useStore();
  const confirm = useConfirm();
  const name = auth.session?.username ?? '';
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [conf, setConf] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [delPw, setDelPw] = useState('');
  const [delMsg, setDelMsg] = useState<string | null>(null);

  const change = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await auth.service.changePassword(name, oldPw, newPw, conf);
      setOld(''); setNew(''); setConf('');
      setMsg({ ok: true, text: 'Đã đổi mật khẩu. Dữ liệu của bạn vẫn nguyên vẹn.' });
    } catch (x) {
      setMsg({ ok: false, text: x instanceof AuthError ? x.message : 'Không đổi được mật khẩu.' });
    }
    setBusy(false);
  };

  const remove = async () => {
    setDelMsg(null);
    if (!delPw) return setDelMsg('Hãy nhập mật khẩu để xác nhận.');
    if (!(await confirm(`Xóa vĩnh viễn tài khoản “${name}” và toàn bộ dữ liệu điểm? Không thể khôi phục.`, 'Xóa tài khoản', true))) return;
    setBusy(true);
    try {
      await auth.service.deleteAccount(name, delPw);
      auth.logout();
    } catch (x) {
      setDelMsg(x instanceof AuthError ? x.message : 'Không xóa được tài khoản.');
      setBusy(false);
    }
  };

  return (
    <section className="card" id="account-card" aria-labelledby="h-account">
      <h2 id="h-account">Tài khoản và bảo mật</h2>
      <p className="muted small">
        Đang đăng nhập: <b>{name}</b>. Dữ liệu được mã hóa AES-256 bằng khóa riêng của tài khoản và chỉ lưu trong trình duyệt này.
        {st.warnings.length > 0 && ` Lưu ý khi tải: ${st.warnings[0]}`}
      </p>
      <form className="form" onSubmit={change} noValidate>
        <label><span>Mật khẩu hiện tại</span><input type="password" autoComplete="current-password" maxLength={PASSWORD_MAX} value={oldPw} onChange={(e) => setOld(e.target.value)} /></label>
        <label><span>Mật khẩu mới</span><input type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={newPw} onChange={(e) => setNew(e.target.value)} /></label>
        <label><span>Nhập lại mật khẩu mới</span><input type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} value={conf} onChange={(e) => setConf(e.target.value)} /></label>
        <div className="w3 row wrap">
          <button className="btn primary" type="submit" disabled={busy || !oldPw || !newPw}>Đổi mật khẩu</button>
        </div>
      </form>
      {msg && <p className={`status ${msg.ok ? 'ok' : 'error'}`} role="status">{msg.text}</p>}
      <details className="help">
        <summary>Xóa tài khoản</summary>
        <div className="form two">
          <label className="w2"><span>Nhập mật khẩu để xác nhận</span><input type="password" autoComplete="current-password" maxLength={PASSWORD_MAX} value={delPw} onChange={(e) => setDelPw(e.target.value)} /></label>
        </div>
        {delMsg && <p className="status error" role="alert">{delMsg}</p>}
        <div className="row add"><button className="btn danger" disabled={busy} onClick={() => void remove()}>Xóa tài khoản và dữ liệu</button></div>
      </details>
    </section>
  );
}
