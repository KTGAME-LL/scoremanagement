import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { cumulativeByTerm, termLabel, termStats, yearStats } from '../core/stats';
import { effectiveTarget } from '../core/targets';
import { LineChart } from './Charts';

/** Ba biểu đồ mô tả tiến trình điểm số, tương ứng ba biểu đồ của bảng tính. */
export function ProgressCharts() {
  const { data, ev } = useStore();
  const s = data.settings;
  const [scale, setScale] = useState<'10' | '4'>('10');
  const terms = useMemo(() => termStats(ev, s), [ev, s]);
  const cum = useMemo(() => cumulativeByTerm(ev, s), [ev, s]);
  const years = useMemo(() => yearStats(ev, s), [ev, s]);

  const used = [...new Set(data.courses.map((c) => c.term))].sort((a, b) => a - b);
  const [term, setTerm] = useState<number | null>(null);
  const curTerm = term !== null && used.includes(term) ? term : used[used.length - 1] ?? 0;

  const inTerm = ev.filter((e) => e.course.term === curTerm);
  const maxTerm = used.length ? Math.max(...used) : 0;
  const key = scale === '10' ? 'gpa10' : 'gpa4';
  const max = scale === '10' ? s.scaleMax : 4;
  const dec = s.gpaDecimals;

  const termPts = Array.from({ length: maxTerm + 1 }, (_, i) => i);
  const maxYear = Math.floor(maxTerm / Math.max(1, s.termsPerYear));
  const yearPts = Array.from({ length: maxYear + 1 }, (_, i) => i);
  const cumAtYearEnd = yearPts.map((y) => {
    let v: number | null = null;
    for (let t = y * s.termsPerYear; t < (y + 1) * s.termsPerYear; t++) {
      const c = cum.find((x) => x.term === t);
      if (c && c[key] !== null) v = c[key];
    }
    return v;
  });

  return (
    <section className="card" aria-labelledby="h-prog-chart">
      <div className="card-head">
        <h2 id="h-prog-chart">Biểu đồ mô tả tiến trình điểm số</h2>
        <div className="seg" role="group" aria-label="Thang điểm của biểu đồ GPA">
          <button className={scale === '10' ? 'on' : ''} aria-pressed={scale === '10'} onClick={() => setScale('10')}>Thang {s.scaleMax}</button>
          <button className={scale === '4' ? 'on' : ''} aria-pressed={scale === '4'} onClick={() => setScale('4')}>Thang 4</button>
        </div>
      </div>

      <div className="chart-block">
        <div className="card-head">
          <h3>Điểm từng học phần trong một học kỳ</h3>
          <select value={curTerm} aria-label="Chọn học kỳ cho biểu đồ" onChange={(e) => setTerm(Number(e.target.value))}>
            {used.map((t) => <option key={t} value={t}>{termLabel(t, s)}</option>)}
          </select>
        </div>
        <LineChart
          title="Điểm từng học phần"
          labels={inTerm.map((e) => e.course.code || e.course.name.slice(0, 10) || 'Môn')}
          sublabels={inTerm.map((e) => (e.course.code ? e.course.name.slice(0, 14) : ''))}
          max={s.scaleMax}
          decimals={s.courseDecimals}
          series={[
            { name: 'Điểm tổng kết', values: inTerm.map((e) => e.result.total), tone: 0 },
            { name: 'Mục tiêu', values: inTerm.map((e) => effectiveTarget(e.course.target, s)?.t10 ?? null), tone: 1, dashed: true },
          ]}
        />
      </div>

      <div className="two-charts">
        <div className="chart-block">
          <h3>GPA theo học kỳ</h3>
          <LineChart
            title="GPA theo học kỳ"
            labels={termPts.map((t) => s.termNames[t % s.termsPerYear] || `HK${(t % s.termsPerYear) + 1}`)}
            sublabels={termPts.map((t) => (t % s.termsPerYear === 0 ? `${s.yearLabel} ${Math.floor(t / s.termsPerYear) + 1}` : ''))}
            max={max}
            decimals={dec}
            series={[
              { name: 'GPA học kỳ', values: termPts.map((t) => terms.find((x) => x.term === t)?.[key] ?? null), tone: 0 },
              { name: 'GPA tích lũy', values: termPts.map((t) => cum.find((x) => x.term === t)?.[key] ?? null), tone: 2 },
            ]}
          />
        </div>
        <div className="chart-block">
          <h3>GPA theo năm học</h3>
          <LineChart
            title="GPA theo năm học"
            labels={yearPts.map((y) => `${s.yearLabel} ${y + 1}`)}
            max={max}
            decimals={dec}
            series={[
              { name: 'GPA năm học', values: yearPts.map((y) => years.find((x) => x.year === y)?.[key] ?? null), tone: 0 },
              { name: 'Tích lũy đến cuối năm', values: cumAtYearEnd, tone: 2 },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
