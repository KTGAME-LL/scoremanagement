import { useMemo } from 'react';
import { useStore } from '../state/store';
import { termLabel, totals } from '../core/stats';
import { ProgressCharts } from './Progress';
import { fmt } from './format';
import type { Level } from '../core/types';

const LEVEL_TEXT: Record<Level, string> = { ok: 'Hợp lệ', info: 'Chưa đủ', warn: 'Cần xem lại', error: 'Có lỗi' };

export function Overview() {
  const st = useStore();
  const { data, ev } = st;
  const s = data.settings;
  const tot = useMemo(() => totals(ev, s), [ev, s]);

  if (!data.courses.length) {
    return (
      <section className="empty">
        <h1>Bắt đầu với môn học đầu tiên</h1>
        <p>Mỗi môn có bảng thành phần riêng: bật hoặc tắt từng thành phần, đặt trọng số, gộp các cột dùng chung trọng số, nhập điểm tiến trình và đặt điểm mục tiêu.</p>
        <button className="btn primary" onClick={() => st.addCourse(0)}>Thêm môn học</button>
        <p className="muted small">Dữ liệu chỉ lưu trên máy này. Bạn có thể xuất sao lưu bất kỳ lúc nào ở thanh bên.</p>
      </section>
    );
  }

  const usedTerms = new Set(data.courses.map((c) => c.term));
  const byTerm = [...usedTerms].sort((a, b) => a - b);

  return (
    <div className="stack">
      <h1>Tổng quan</h1>
      <div className="stats">
        <div className="stat"><span>Điểm TB tích lũy (thang {s.scaleMax})</span><strong>{tot.gpa10 === null ? 'Chưa có' : fmt(tot.gpa10, s.gpaDecimals)}</strong></div>
        <div className="stat"><span>Điểm TB tích lũy (thang 4)</span><strong>{tot.gpa4 === null ? 'Chưa có' : fmt(tot.gpa4, s.gpaDecimals)}</strong></div>
        <div className="stat"><span>Tín chỉ đã đạt / đăng ký</span><strong>{tot.earned} / {tot.registered}</strong></div>
        <div className="stat"><span>Môn đã có điểm</span><strong>{tot.graded} / {tot.courses}</strong></div>
      </div>

      <ProgressCharts />

      {byTerm.map((t) => (
        <section className="card" key={t}>
          <h2>{termLabel(t, s)}</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr><th>Môn học</th><th className="r">TC</th><th>Thành phần</th><th className="r">Tổng kết</th><th>Điểm chữ</th><th>Trạng thái</th></tr>
              </thead>
              <tbody>
                {ev.filter((e) => e.course.term === t).map(({ course: c, result: r }) => (
                  <tr key={c.id}>
                    <td>
                      <button className="link" onClick={() => st.go('course', c.id)}>
                        {c.name || '(Chưa đặt tên)'}
                      </button>
                      {c.code && <small className="muted"> {c.code}</small>}
                    </td>
                    <td className="r">{c.credits ?? '·'}</td>
                    <td>
                      <div className="chips">
                        {c.useProgress && c.progress !== null && (
                          <button className="chip" onClick={() => st.go('course', c.id, 'progress')}>Tiến trình {fmt(c.progress, 2)}</button>
                        )}
                        {c.components.filter((x) => x.enabled).map((x) => (
                          <button key={x.id} className={`chip ${x.score === null ? 'empty' : ''}`} onClick={() => st.go('course', c.id, `cmp-${x.id}`)}>
                            {x.name} {x.score === null ? '·' : fmt(x.score, 2)}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="r"><strong>{fmt(r.total, s.courseDecimals)}</strong></td>
                    <td>{r.letter || '·'}</td>
                    <td><span className={`pill ${r.status.level}`} title={r.status.message}>{LEVEL_TEXT[r.status.level]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
