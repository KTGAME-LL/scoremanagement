import { useState, type FormEvent } from 'react';
import { useAuth } from '../state/auth';
import { AuthError, PASSWORD_MAX, USERNAME_MAX, validatePassword, validateUsername } from '../core/auth';

type Mode = 'login' | 'register';

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>(auth.hasAccounts ? 'login' : 'register');
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [adopt, setAdopt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field: string; msg: string } | null>(null);

  const reg = mode === 'register';
  // Gợi ý tức thì khi đăng ký (không báo lỗi lúc ô còn trống).
  const uHint = reg && u ? validateUsername(u) : null;
  const pHint = reg && p ? validatePassword(p, u) : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      if (reg) await auth.register(u, p, c, remember, adopt && auth.hasLegacy);
      else await auth.login(u, p, remember);
    } catch (x) {
      if (x instanceof AuthError) setErr({ field: x.field ?? 'form', msg: x.message });
      else setErr({ field: 'form', msg: 'Có lỗi xảy ra, hãy thử lại.' });
      setBusy(false);
    }
  };

  const field = (name: string) => (err?.field === name ? err.msg : null);

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit} noValidate aria-labelledby="auth-title">
        <div className="brand">
          <span className="logo" aria-hidden="true">Σ</span>
          <div>
            <strong id="auth-title">Điểm học phần</strong>
            <small>Tính điểm theo trọng số</small>
          </div>
        </div>
        <div className="seg wide" role="tablist" aria-label="Chế độ">
          <button type="button" role="tab" aria-selected={!reg} className={!reg ? 'on' : ''} onClick={() => { setMode('login'); setErr(null); }}>Đăng nhập</button>
          <button type="button" role="tab" aria-selected={reg} className={reg ? 'on' : ''} onClick={() => { setMode('register'); setErr(null); }}>Tạo tài khoản</button>
        </div>

        {auth.sync.enabled && <p className="muted small">Máy mới? Chọn Đăng nhập bằng tài khoản đã tạo ở máy khác, dữ liệu sẽ tự về.</p>}

        <label>
          <span>Tên đăng nhập</span>
          <input
            value={u}
            maxLength={USERNAME_MAX}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={!!(uHint || field('username')) || undefined}
            aria-describedby="u-msg"
            onChange={(e) => setU(e.target.value)}
            autoFocus
          />
          <small id="u-msg" className="fmsg">{field('username') || uHint || (reg ? `${3} đến ${USERNAME_MAX} ký tự: chữ, số, . _ -` : '')}</small>
        </label>

        <label>
          <span>Mật khẩu</span>
          <span className="pw">
            <input
              type={show ? 'text' : 'password'}
              value={p}
              maxLength={PASSWORD_MAX}
              autoComplete={reg ? 'new-password' : 'current-password'}
              aria-invalid={!!(pHint || field('password')) || undefined}
              aria-describedby="p-msg"
              onChange={(e) => setP(e.target.value)}
            />
            <button type="button" className="btn" aria-pressed={show} onClick={() => setShow((x) => !x)}>{show ? 'Ẩn' : 'Hiện'}</button>
          </span>
          <small id="p-msg" className="fmsg">{field('password') || pHint || (reg ? 'Ít nhất 8 ký tự, có cả chữ và số.' : '')}</small>
        </label>

        {reg && (
          <label>
            <span>Nhập lại mật khẩu</span>
            <input
              type={show ? 'text' : 'password'}
              value={c}
              maxLength={PASSWORD_MAX}
              autoComplete="new-password"
              aria-invalid={!!field('confirm') || undefined}
              onChange={(e) => setC(e.target.value)}
            />
            <small className="fmsg">{field('confirm') || (c && p !== c ? 'Chưa khớp với mật khẩu ở trên.' : '')}</small>
          </label>
        )}

        <label className="check-line">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Giữ đăng nhập khi tải lại trang (chỉ trong tab này, tự hết khi đóng tab)</span>
        </label>
        {reg && auth.hasLegacy && (
          <label className="check-line">
            <input type="checkbox" checked={adopt} onChange={(e) => setAdopt(e.target.checked)} />
            <span>Chuyển dữ liệu đã nhập trước đây trên trình duyệt này vào tài khoản mới (sẽ được mã hóa)</span>
          </label>
        )}

        {field('form') && <p className="status error" role="alert">{field('form')}</p>}
        <button className="btn primary big" type="submit" disabled={busy}>
          {busy ? 'Đang xử lý…' : reg ? 'Tạo tài khoản' : 'Đăng nhập'}
        </button>

        <p className="muted small">
          Tài khoản được tạo và lưu ngay trong trình duyệt này; dữ liệu điểm được mã hóa bằng mật khẩu của bạn. Không có máy chủ nên <b>không khôi phục được mật khẩu</b> và không tự chuyển sang máy khác. Hãy nhớ mật khẩu và dùng nút Xuất Excel để giữ một bản.
        </p>
      </form>
    </main>
  );
}
