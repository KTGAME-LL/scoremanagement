import { useStore } from '../state/store';
import { termLabel } from '../core/stats';

export function ProgramView() {
  const st = useStore();
  const s = st.data.settings;
  const prog = st.data.program;
  const terms = Array.from({ length: s.termCount }, (_, i) => i);
  const num = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.min(99, Number(v) || 0)));


  return (
    <div className="stack">
      <h1>Chương trình đào tạo</h1>
      <p className="muted">Danh sách môn theo từng học kỳ của ngành. Dùng để tra hình thức kiểm tra và thêm nhanh môn vào bảng điểm. Môn đã có (trùng mã hoặc tên) sẽ không bị thêm lặp.</p>
      {terms.map((t) => {
        const rows = prog.filter((p) => p.term === t);
        return (
          <section className="card" key={t}>
            <div className="row wrap between">
              <h2>{termLabel(t, s)}</h2>
              <div className="row wrap">
                <button className="btn" disabled={!rows.length} onClick={() => st.addProgramToTranscript(rows.map((r) => r.id))}>Thêm cả học kỳ vào bảng điểm</button>
                <button className="btn" disabled={prog.length >= 300} onClick={() => st.addProgram(t)}>Thêm môn</button>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="muted small">Chưa có môn nào trong học kỳ này.</p>
            ) : (
              <div className="table-wrap">
                <table className="tbl">
                  <thead><tr><th>STT</th><th>Mã</th><th>Tên môn</th><th>TC</th><th>Giảng viên</th><th>Kiểm tra</th><th>Giữa kỳ</th><th>Cuối kỳ</th><th>Ghi chú</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const f = (k: 'code' | 'name' | 'instructor' | 'test' | 'midterm' | 'final' | 'note', label: string, max = 120) => (
                        <input value={r[k]} maxLength={max} aria-label={label} onChange={(e) => st.patchProgram(r.id, { [k]: e.target.value }, `${r.id}-${k}`)} />
                      );
                      return (
                        <tr key={r.id}>
                          <td className="r">{i + 1}</td>
                          <td>{f('code', 'Mã môn', 30)}</td>
                          <td>{f('name', 'Tên môn')}</td>
                          <td><input className="tiny" inputMode="decimal" value={r.credits ?? ''} aria-label="Tín chỉ" onChange={(e) => st.patchProgram(r.id, { credits: num(e.target.value) }, `${r.id}-cr`)} /></td>
                          <td>{f('instructor', 'Giảng viên')}</td>
                          <td>{f('test', 'Hình thức kiểm tra')}</td>
                          <td>{f('midterm', 'Hình thức giữa kỳ')}</td>
                          <td>{f('final', 'Hình thức cuối kỳ')}</td>
                          <td>{f('note', 'Ghi chú', 300)}</td>
                          <td className="acts">
                            <button className="btn" onClick={() => st.addProgramToTranscript([r.id])}>Thêm vào bảng điểm</button>
                            <button className="icon danger" aria-label="Xóa môn" onClick={() => st.deleteProgram(r.id)}>✕</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
