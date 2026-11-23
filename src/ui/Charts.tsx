import { fmt } from './format';

export interface Series {
  name: string;
  values: (number | null)[];
  dashed?: boolean;
  /** Chỉ số màu 0..2 (xem styles.css: --c0, --c1, --c2). */
  tone?: number;
}

interface Props {
  labels: string[];
  sublabels?: string[];
  series: Series[];
  max: number;
  decimals: number;
  title: string;
}

const W = 640;
const H = 240;
const PAD = { l: 38, r: 16, t: 16, b: 46 };

/** Đường cong đơn điệu (không vượt quá các điểm dữ liệu) để nét mảnh, mượt như sợi chỉ. */
function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    m.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + t[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - t[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}

function Marker({ x, y, tone }: { x: number; y: number; tone: number }) {
  const c = `mk-${tone}`;
  if (tone === 1) return <rect x={x - 3.5} y={y - 3.5} width={7} height={7} className={`pt ${c}`} />;
  if (tone === 2) return <path d={`M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} Z`} className={`pt ${c}`} />;
  return <circle cx={x} cy={y} r={3.6} className={`pt ${c}`} />;
}

/** Biểu đồ đường mảnh (sợi chỉ): mỗi chuỗi một màu và một dạng điểm, ngắt đoạn ở chỗ thiếu dữ liệu. */
export function LineChart({ labels, sublabels, series, max, decimals, title }: Props) {
  const n = Math.max(labels.length, 1);
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => (n === 1 ? PAD.l + iw / 2 : PAD.l + (iw * i) / (n - 1));
  const y = (v: number) => PAD.t + ih - (Math.max(0, Math.min(max, v)) / max) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => (max * k) / 4);
  const every = Math.ceil(n / 10);
  const hasData = series.some((s) => s.values.some((v) => v !== null));

  const summary = series
    .map((s) => `${s.name}: ${s.values.map((v, i) => (v === null ? null : `${labels[i]} ${fmt(v, decimals)}`)).filter(Boolean).join(', ') || 'chưa có'}`)
    .join('. ');

  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. ${summary}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="axis">{fmt(t, Number.isInteger(t) ? 0 : 1)}</text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 ? (
            <g key={i}>
              <text x={x(i)} y={H - 26} textAnchor="middle" className="axis">{l}</text>
              {sublabels?.[i] && <text x={x(i)} y={H - 12} textAnchor="middle" className="axis sub">{sublabels[i]}</text>}
            </g>
          ) : null,
        )}
        {series.map((s, si) => {
          const tone = s.tone ?? si;
          // Tách thành các đoạn liên tục.
          const runs: { x: number; y: number }[][] = [];
          let cur: { x: number; y: number }[] = [];
          s.values.forEach((v, i) => {
            if (v === null) { if (cur.length) runs.push(cur); cur = []; } else cur.push({ x: x(i), y: y(v) });
          });
          if (cur.length) runs.push(cur);
          return (
            <g key={si} className={`ser s-${tone} ${s.dashed ? 'dashed' : ''}`}>
              {runs.map((r, k) =>
                r.length === 1 && s.dashed ? (
                  <line key={k} x1={r[0].x - 14} x2={r[0].x + 14} y1={r[0].y} y2={r[0].y} className="thread" />
                ) : (
                  <path key={k} d={smoothPath(r)} className="thread" fill="none" />
                ),
              )}
              {!s.dashed && s.values.map((v, i) => v !== null && (
                <g key={i}>
                  <Marker x={x(i)} y={y(v)} tone={tone} />
                  <title>{`${s.name}, ${labels[i]}: ${fmt(v, decimals)}`}</title>
                </g>
              ))}
            </g>
          );
        })}
        {!hasData && <text x={W / 2} y={H / 2} textAnchor="middle" className="axis">Chưa có dữ liệu để vẽ</text>}
      </svg>
      <figcaption>
        {series.map((s, si) => (
          <span key={si} className={`lg s-${s.tone ?? si}`}>
            <svg width="26" height="10" aria-hidden="true">
              <line x1="0" x2="26" y1="5" y2="5" className={`thread ${s.dashed ? 'dashed' : ''}`} />
              {!s.dashed && <Marker x={13} y={5} tone={s.tone ?? si} />}
            </svg>
            {s.name}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
