import { useStore } from '../state/store';
import { NumberField } from './NumberField';
import { fmt } from './format';
import { computeHints, effectiveTarget, hintText } from '../core/targets';
import { termLabel } from '../core/stats';

/** Bảng mục tiêu điểm số của mọi học phần (nhập 1 trong 3 thang, hai thang còn lại tự quy đổi). */
export function TargetsView() {
  const st = useStore();
  const { data, ev } = st;
  const s = data.settings;
  const letters = s.conversion.map((r) => r.letter);

  if (!ev.length) {
    return (
      <section className="empty">
        <h1>Mục tiêu điểm số</h1>
        <p>Chưa có học phần nào. Thêm môn học rồi đặt điểm mong muốn cho từng môn.</p>
        <button className="btn primary" onClick={() => st.addCourse(0)}>Thêm môn học</button>
      </section>
    );
  }

  return (
    <div className="stack">
      <div>
        <h1>Mục tiêu điểm số từng học phần</h1>
        <p className="muted">
          Nhập mục tiêu ở một trong ba thang. Hai thang còn lại tự quy đổi ở mức cao nhất tương ứng. Cột “Cần đạt” cho biết điểm tiến trình hoặc điểm cuối kỳ cần có (hiện chữ đỏ đậm).
        </p>
      </div>
      <section className="card">
        <div className="table-wrap">
          <table className="tbl targets">
            <thead>
              <tr>
                <th rowSpan={2}>STT</th><th rowSpan={2}>Mã môn</th><th rowSpan={2}>Tên học phần</th>
                <th colSpan={3} className="grp">Nhập mục tiêu (1 trong 3 thang)</th>
                <th colSpan={3} className="grp">Quy đổi tự động</th>
                <th rowSpan={2} className="r">Hiện tại</th>
                <th colSpan={2} className="grp">Cần đạt</th>
                <th rowSpan={2}>Tình trạng</th>
              </tr>
              <tr>
                <th>Thang {s.scaleMax}</th><th>Thang 4</th><th>Điểm chữ</th>
                <th>Thang {s.scaleMax}</th><th>Thang 4</th><th>Điểm chữ</th>
                <th>Tiến trình</th><th>Cuối kỳ</th>
              </tr>
            </thead>
            <tbody>
              {ev.map(({ course: c, result: r }, i) => {
                const tgt = effectiveTarget(c.target, s);
                const h = computeHints(c, r, s);
                const set = (patch: Partial<typeof c.target>, key: string) => st.patchCourse(c.id, { target: { ...c.target, ...patch } }, key);
                let state = 'Chưa đặt mục tiêu';
                let tone = '';
                if (tgt) {
                  if (r.total !== null && r.total >= tgt.t10 - 1e-9) { state = 'Đã đạt mục tiêu'; tone = 'ok'; }
                  else if (h.final?.kind === 'impossible' || h.progress?.kind === 'impossible') { state = 'Không thể đạt với điểm hiện tại'; tone = 'error'; }
                  else if (h.final || h.progress) { state = 'Đang theo dõi'; tone = 'info'; }
                  else state = 'Chưa đủ dữ liệu để gợi ý';
                }
                return (
                  <tr key={c.id}>
                    <td>{i + 1}</td>
                    <td>{c.code || '·'}</td>
                    <td>
                      <button className="link" onClick={() => st.go('course', c.id)}>{c.name || '(Chưa đặt tên)'}</button>
                      <small className="muted block">Khớp: {termLabel(c.term, s)}</small>
                    </td>
                    <td><NumberField label={`Mục tiêu thang ${s.scaleMax} của ${c.name}`} min={0} max={s.scaleMax} value={c.target.t10} onChange={(v) => set({ t10: v }, 't10')} /></td>
                    <td><NumberField label={`Mục tiêu thang 4 của ${c.name}`} min={0} max={4} value={c.target.t4} onChange={(v) => set({ t4: v }, 't4')} /></td>
                    <td>
                      <select aria-label={`Mục tiêu điểm chữ của ${c.name}`} value={c.target.letter} onChange={(e) => set({ letter: e.target.value }, 'letter')}>
                        <option value="">Chưa chọn</option>
                        {letters.map((l) => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td className="auto">{tgt ? fmt(tgt.t10, s.courseDecimals) : '·'}</td>
                    <td className="auto">{tgt ? fmt(tgt.gpa4, 1) : '·'}</td>
                    <td className="auto">{tgt ? tgt.letter : '·'}</td>
                    <td className="r"><strong>{fmt(r.total, s.courseDecimals)}</strong></td>
                    <td className="need">{hintText(h.progress) || '·'}</td>
                    <td className="need">{hintText(h.final) || '·'}</td>
                    <td><span className={`pill ${tone || 'info'}`}>{state}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
