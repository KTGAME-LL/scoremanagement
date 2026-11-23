import { useEffect, useState } from 'react';
import { isValidClientId } from '../core/google';
import { useStore } from '../state/store';
import { useConfirm } from './Confirm';
import { NumberField } from './NumberField';
import { DEFAULT_COMPONENT_LIBRARY, DEFAULT_CONVERSION } from '../core/defaults';
import type { ConversionRow, Settings } from '../core/types';

export function SettingsView() {
  const st = useStore();
  const confirm = useConfirm();
  const s = st.data.settings;
  const lib = st.data.componentLibrary;
  const [newName, setNewName] = useState('');
  const [cid, setCid] = useState(st.google.clientId);
  const cidBad = cid.trim() !== '' && !isValidClientId(cid.trim());
  useEffect(() => {
    if (st.ui.focusId) document.getElementById(st.ui.focusId)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [st.ui.focusId]);
  const p = (patch: Partial<Settings>, key?: string) => st.patchSettings(patch, key);
  const stu = (k: keyof Settings['student'], v: string) => p({ student: { ...s.student, [k]: v.slice(0, 120) } }, `stu-${k}`);

  const setRow = (i: number, patch: Partial<ConversionRow>, key: string) =>
    p({ conversion: s.conversion.map((r, j) => (j === i ? { ...r, ...patch } : r)) }, `conv-${i}-${key}`);
  const sorted = s.conversion.every((r, i) => i === 0 || r.from > s.conversion[i - 1].from) && s.conversion[0]?.from === 0;

  return (
    <div className="stack">
      <h1>Cấu hình</h1>

      <section className="card" id="google-card" aria-labelledby="h-google">
        <h2 id="h-google">Đăng nhập Google và đồng bộ</h2>
        <p className="muted small">
          Khi đăng nhập, dữ liệu được lưu thêm vào một thư mục ẩn của ứng dụng trong Google Drive của bạn, để dùng trên nhiều máy và không bị mất. Ứng dụng chỉ xin quyền thư mục ẩn này (không đọc được tệp khác) cùng tên và email để hiển thị.
        </p>
        <div className="form">
          <label className="w3">
            <span>Client ID của Google</span>
            <input value={cid} maxLength={200} spellCheck={false} autoComplete="off" placeholder="123456789012-abc...xyz.apps.googleusercontent.com" aria-invalid={cidBad || undefined} onChange={(e) => setCid(e.target.value)} />
          </label>
        </div>
        {cidBad && <p className="status error">Client ID chưa đúng dạng (…apps.googleusercontent.com).</p>}
        <div className="row wrap add">
          <button
            className="btn primary"
            disabled={cidBad || cid.trim() === st.google.clientId}
            onClick={() => (st.setGoogleClientId(cid) ? st.notify(cid.trim() ? 'Đã lưu Client ID. Bấm Đăng nhập Google ở thanh bên.' : 'Đã xóa Client ID.') : st.notify('Client ID không hợp lệ.'))}
          >
            Lưu Client ID
          </button>
          {st.google.clientId && !st.google.linked && (
            <button className="btn" disabled={!st.google.supported} onClick={() => void st.googleSignIn()}>Đăng nhập Google</button>
          )}
        </div>
        {!st.google.supported && <p className="status warn">Bạn đang mở tệp trực tiếp trên máy. Google chỉ cho đăng nhập khi trang chạy qua địa chỉ https (ví dụ GitHub Pages). Phần nhập dữ liệu vẫn dùng bình thường, và dữ liệu vẫn tự lưu trên máy.</p>}
        <details className="help">
          <summary>Cách lấy Client ID (làm một lần, miễn phí)</summary>
          <ol>
            <li>Vào console.cloud.google.com, tạo một dự án mới.</li>
            <li>Mục “APIs &amp; Services”, bật “Google Drive API”.</li>
            <li>Mục “OAuth consent screen”: chọn External, điền tên ứng dụng và email, thêm tài khoản của bạn vào “Test users”.</li>
            <li>Mục “Credentials”, chọn Create credentials, rồi OAuth client ID, loại “Web application”.</li>
            <li>Ở “Authorized JavaScript origins” thêm địa chỉ trang của bạn, ví dụ https://tên-bạn.github.io (chỉ phần gốc, không có đường dẫn).</li>
            <li>Sao chép Client ID (dạng …apps.googleusercontent.com) dán vào ô trên, bấm Lưu Client ID.</li>
          </ol>
        </details>
      </section>

      <section className="card">
        <h2>Thông tin sinh viên</h2>
        <div className="form">
          <label><span>Họ tên</span><input value={s.student.name} maxLength={120} onChange={(e) => stu('name', e.target.value)} /></label>
          <label><span>Mã sinh viên</span><input value={s.student.id} maxLength={120} onChange={(e) => stu('id', e.target.value)} /></label>
          <label><span>Trường</span><input value={s.student.school} maxLength={120} onChange={(e) => stu('school', e.target.value)} /></label>
          <label><span>Ngành</span><input value={s.student.major} maxLength={120} onChange={(e) => stu('major', e.target.value)} /></label>
        </div>
      </section>

      <section className="card">
        <h2>Thang điểm và làm tròn</h2>
        <div className="form">
          <label><span>Thang điểm tối đa</span><NumberField label="Thang điểm tối đa" min={1} max={100} value={s.scaleMax} onChange={(v) => v && p({ scaleMax: v }, 'scale')} /></label>
          <label><span>Số lẻ điểm môn</span><NumberField label="Số lẻ điểm môn" min={0} max={3} value={s.courseDecimals} onChange={(v) => v !== null && p({ courseDecimals: Math.round(v) }, 'cd')} /></label>
          <label><span>Số lẻ điểm trung bình</span><NumberField label="Số lẻ điểm trung bình" min={0} max={3} value={s.gpaDecimals} onChange={(v) => v !== null && p({ gpaDecimals: Math.round(v) }, 'gd')} /></label>
          <label><span>Điểm đạt học phần (tối thiểu)</span><NumberField label="Điểm đạt" min={0} max={s.scaleMax} value={s.passScore} onChange={(v) => v !== null && p({ passScore: v }, 'ps')} /></label>
          <label><span>Điểm đạt môn chỉ cần “Đạt”</span><NumberField label="Điểm đạt môn chỉ cần đạt" min={0} max={s.scaleMax} value={s.passOnlyScore} onChange={(v) => v !== null && p({ passOnlyScore: v }, 'pos')} /></label>
          <label className="check-line w2">
            <input type="checkbox" checked={s.failCountsInGpa} onChange={(e) => p({ failCountsInGpa: e.target.checked })} />
            <span>Môn không đạt vẫn tính vào điểm trung bình</span>
          </label>
          <label className="check-line w2">
            <input type="checkbox" checked={s.bonusDefault} onChange={(e) => p({ bonusDefault: e.target.checked })} />
            <span>Mặc định cộng điểm thưởng</span>
          </label>
        </div>
      </section>

      <section className="card">
        <h2>Cấu trúc học kỳ</h2>
        <div className="form">
          <label><span>Tổng số học kỳ</span><NumberField label="Tổng số học kỳ" min={1} max={24} value={s.termCount} onChange={(v) => v && p({ termCount: Math.round(v) }, 'tc')} /></label>
          <label><span>Số học kỳ mỗi năm</span><NumberField label="Số học kỳ mỗi năm" min={1} max={4} value={s.termsPerYear} onChange={(v) => v && p({ termsPerYear: Math.round(v) }, 'tpy')} /></label>
          <label><span>Tên “năm”</span><input value={s.yearLabel} maxLength={20} onChange={(e) => p({ yearLabel: e.target.value }, 'yl')} /></label>
          {Array.from({ length: s.termsPerYear }, (_, i) => (
            <label key={i}><span>Tên học kỳ {i + 1}</span>
              <input value={s.termNames[i]} maxLength={20} onChange={(e) => p({ termNames: s.termNames.map((x, j) => (j === i ? e.target.value : x)) }, `tn${i}`)} />
            </label>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Thư viện thành phần</h2>
        <p className="muted small">Các tên dùng nhanh khi thêm thành phần vào môn.</p>
        <div className="chips">
          {lib.map((n, i) => (
            <span key={`${n}-${i}`} className="chip tag">
              {n}
              <button className="x" aria-label={`Xóa “${n}” khỏi thư viện`} onClick={() => st.setLibrary(lib.filter((_, j) => j !== i))}>✕</button>
            </span>
          ))}
        </div>
        <form
          className="row add"
          onSubmit={(e) => {
            e.preventDefault();
            const n = newName.trim().slice(0, 60);
            if (n && lib.length < 30 && !lib.includes(n)) { st.setLibrary([...lib, n]); setNewName(''); }
          }}
        >
          <input value={newName} maxLength={60} placeholder="Tên thành phần mới…" aria-label="Tên thành phần mới" onChange={(e) => setNewName(e.target.value)} />
          <button className="btn" type="submit" disabled={!newName.trim()}>Thêm vào thư viện</button>
          <button type="button" className="btn" onClick={() => st.setLibrary([...DEFAULT_COMPONENT_LIBRARY])}>Khôi phục mặc định</button>
        </form>
      </section>

      <section className="card">
        <h2>Bảng quy đổi điểm</h2>
        <p className="muted small">Mỗi dòng áp dụng cho điểm từ mức “Từ” trở lên đến trước mức của dòng kế tiếp. Dòng đầu phải bắt đầu từ 0.</p>
        {!sorted && <p className="status warn">Các mức “Từ” cần tăng dần và dòng đầu bằng 0.</p>}
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Từ (≥)</th><th>Điểm chữ</th><th>Thang 4</th><th>Xếp loại</th><th /></tr></thead>
            <tbody>
              {s.conversion.map((r, i) => (
                <tr key={i}>
                  <td><NumberField label="Từ điểm" min={0} max={s.scaleMax} value={r.from} onChange={(v) => v !== null && setRow(i, { from: v }, 'from')} /></td>
                  <td><input value={r.letter} maxLength={6} aria-label="Điểm chữ" onChange={(e) => setRow(i, { letter: e.target.value }, 'l')} /></td>
                  <td><NumberField label="Thang 4" min={0} max={4} value={r.gpa4} onChange={(v) => v !== null && setRow(i, { gpa4: v }, 'g')} /></td>
                  <td><input value={r.rank} maxLength={30} aria-label="Xếp loại" onChange={(e) => setRow(i, { rank: e.target.value }, 'r')} /></td>
                  <td className="acts">
                    <button className="icon danger" disabled={s.conversion.length <= 1} aria-label="Xóa dòng" onClick={() => p({ conversion: s.conversion.filter((_, j) => j !== i) })}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row wrap add">
          <button className="btn" disabled={s.conversion.length >= 20} onClick={() => p({ conversion: [...s.conversion, { from: Math.min(s.scaleMax, (s.conversion[s.conversion.length - 1]?.from ?? 0) + 1), letter: '?', gpa4: 0, rank: '' }] })}>Thêm dòng</button>
          <button className="btn" onClick={() => p({ conversion: [...s.conversion].sort((a, b) => a.from - b.from) })}>Sắp xếp theo điểm</button>
          <button
            className="btn"
            onClick={async () => {
              if (await confirm('Khôi phục bảng quy đổi mặc định?', 'Khôi phục')) p({ conversion: DEFAULT_CONVERSION.map((r) => ({ ...r })) });
            }}
          >
            Khôi phục mặc định
          </button>
        </div>
      </section>
    </div>
  );
}
