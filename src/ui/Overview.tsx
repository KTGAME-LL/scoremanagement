import { Fragment, useMemo } from 'react';
import { useStore } from '../state/store';
import { termLabel, termStats, totals, yearStats } from '../core/stats';
import { ProgressCharts } from './Progress';
import { fmt } from './format';
import type { Level } from '../core/types';

const LEVEL_TEXT: Record<Level, string> = { ok: 'Hợp lệ', info: 'Chưa đủ', warn: 'Cần xem lại', error: 'Có lỗi' };

export function Overview() {
  const st = useStore();
  const { data, ev } = st;
  const s = data.settings;
  const tot = useMemo(() => totals(ev, s), [ev, s]);
  const tstat = useMemo(() => termStats(ev, s), [ev, s]);
  const ystat = useMemo(() => yearStats(ev, s), [ev, s]);

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
  const errN = ev.filter((e) => e.result.status.level === 'error').length;
  const warnN = ev.filter((e) => e.result.status.level === 'warn').length;
  const outN = ev.filter((e) => e.course.term >= s.termCount).length;
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

      <div className={`banner ${errN ? 'err' : warnN || outN ? 'warn' : 'ok'}`} role="status">
        {errN ? `${errN} môn có lỗi cần sửa.` : ''} {warnN ? `${warnN} môn cần xem lại.` : ''} {outN ? `${outN} môn thuộc học kỳ chưa kích hoạt trong Cấu hình.` : ''}
        {!errN && !warnN && !outN ? 'Tất cả môn đều hợp lệ.' : ''}
      </div>

      <section className="card">
        <h2>Thống kê theo học kỳ và năm</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Học kỳ</th><th className="r">Số môn</th><th className="r">TC tính điểm</th><th className="r">TB thang {s.scaleMax}</th><th className="r">TB thang 4</th></tr></thead>
            <tbody>
              {ystat.map((y) => (
                <Fragment key={y.year}>
                  {tstat.filter((t) => t.year === y.year).map((t) => (
                    <tr key={t.term}>
                      <td>{termLabel(t.term, s)}</td><td className="r">{t.courses}</td><td className="r">{t.credits || '·'}</td>
                      <td className="r">{t.gpa10 === null ? '·' : fmt(t.gpa10, s.gpaDecimals)}</td><td className="r">{t.gpa4 === null ? '·' : fmt(t.gpa4, s.gpaDecimals)}</td>
                    </tr>
                  ))}
                  <tr key={`y${y.year}`} className="sum">
                    <td><strong>Cả {s.yearLabel.toLowerCase()} {y.year + 1}</strong></td><td /><td />
                    <td className="r"><strong>{y.gpa10 === null ? '·' : fmt(y.gpa10, s.gpaDecimals)}</strong></td><td className="r"><strong>{y.gpa4 === null ? '·' : fmt(y.gpa4, s.gpaDecimals)}</strong></td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ProgressCharts />

      {byTerm.map((t) => (
        <section className="card" key={t}>
          <h2>{termLabel(t, s)}{t >= s.termCount ? ' (chưa kích hoạt trong Cấu hình)' : ''}</h2>
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
