import type { AppData, Course, CourseResult } from './types';
import { evaluateAll, cumulativeByTerm, termLabel, termStats, totals, yearStats } from './stats';
import { computeHints, effectiveTarget, hintText } from './targets';
import { absRef, Workbook, type CellValue, type LineChartSpec, type Sheet, type Style } from './xlsx';

const INK = '1F2933';
const TEAL = '0F5C7A';
const HINT = '9B1313';
const BAND = 'F5F8FB';
const STATUS_BG = { ok: 'E3F4EA', info: 'EEF2F6', warn: 'FFF1D6', error: 'FDE4E2' } as const;
const STATUS_FG = { ok: '17724A', info: '566677', warn: '9A5B00', error: 'B3261E' } as const;

const fmtNum = (d: number) => (d > 0 ? `0.${'0'.repeat(d)}` : '0');

const S = {
  title: { bold: true, size: 16, color: 'FFFFFF', bg: TEAL, valign: 'center' } as Style,
  sub: { italic: true, color: '566677' } as Style,
  head: { bold: true, color: 'FFFFFF', bg: TEAL, align: 'center', valign: 'center', wrap: true, border: true } as Style,
  group: { bold: true, color: TEAL, bg: 'DCECF3', align: 'center', border: true } as Style,
  section: { bold: true, size: 12, color: TEAL } as Style,
};
const body = (extra: Style = {}, zebra = false): Style => ({ border: true, color: INK, bg: zebra ? BAND : undefined, ...extra });

function headerRow(sh: Sheet, row: number, labels: string[], col = 1, height = 34) {
  labels.forEach((l, i) => sh.cell(row, col + i, l, S.head));
  sh.height(row, height);
}

function titleBlock(sh: Sheet, data: AppData, lastCol: number, title: string) {
  const st = data.settings.student;
  sh.cell(1, 1, title, S.title).fill(1, 1, 1, lastCol, S.title).merge(1, 1, 1, lastCol).height(1, 30);
  const info = [st.name && `Họ tên: ${st.name}`, st.id && `MSSV: ${st.id}`, st.school && `Trường: ${st.school}`, st.major && `Ngành: ${st.major}`].filter(Boolean).join('  |  ');
  sh.cell(2, 1, info || 'Chưa nhập thông tin sinh viên (mục Cấu hình)', S.sub).merge(2, 1, 2, lastCol);
  const d = new Date();
  sh.cell(3, 1, `Xuất ngày ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`, S.sub).merge(3, 1, 3, lastCol);
}

function componentSummary(c: Course, r: CourseResult): string {
  const name = (id: string) => c.components.find((x) => x.id === id)?.name ?? '';
  const pct = (w: number) => `${Math.round(w * 10000) / 100}%`;
  const parts: string[] = [];
  if (r.mode === 'progress') parts.push('Tiến trình (đã nhân trọng số)');
  for (const g of r.groups) {
    if (g.ignored) continue;
    parts.push(`${g.memberIds.map(name).join(' + ')}: ${pct(g.weight)}`);
  }
  return parts.join(' | ');
}

export function buildWorkbook(data: AppData): Workbook {
  const s = data.settings;
  const ev = evaluateAll(data);
  const tot = totals(ev, s);
  const terms = termStats(ev, s);
  const cum = cumulativeByTerm(ev, s);
  const years = yearStats(ev, s);
  const cd = fmtNum(s.courseDecimals);
  const gd = fmtNum(s.gpaDecimals);
  const wb = new Workbook();
  wb.title = `Bảng điểm${s.student.name ? ' ' + s.student.name : ''}`;

  /* ===== Tổng quan ===== */
  const ov = wb.addSheet('Tổng quan').tab(TEAL);
  titleBlock(ov, data, 8, 'BẢNG ĐIỂM HỌC TẬP: TỔNG QUAN');
  ov.width(1, 26).width(2, 12).width(3, 14).width(4, 15).width(5, 15).width(6, 16).width(7, 16).width(8, 3);
  const stats: [string, CellValue, string?][] = [
    [`Điểm trung bình tích lũy (thang ${s.scaleMax})`, tot.gpa10, gd],
    ['Điểm trung bình tích lũy (thang 4)', tot.gpa4, gd],
    ['Tín chỉ đã đạt', tot.earned, '0.##'],
    ['Tín chỉ đăng ký', tot.registered, '0.##'],
    ['Số học phần đã có điểm / tổng số', `${tot.graded} / ${tot.courses}`],
  ];
  stats.forEach(([l, v, f], i) => {
    ov.cell(5 + i, 1, l, body({ bold: true, bg: 'DCECF3' })).merge(5 + i, 1, 5 + i, 3).fill(5 + i, 1, 5 + i, 3, body({ bg: 'DCECF3' }));
    ov.cell(5 + i, 4, v, body({ bold: true, size: 12, align: 'center', numFmt: f })).merge(5 + i, 4, 5 + i, 5).fill(5 + i, 4, 5 + i, 5, body());
  });

  const lastTerm = ev.length ? Math.max(...ev.map((e) => e.course.term)) : 0;
  let r = 12;
  ov.cell(r, 1, 'GPA THEO HỌC KỲ', S.section);
  r++;
  const tHead = r;
  headerRow(ov, r, ['Học kỳ', 'Số môn', 'Tín chỉ tính GPA', `GPA học kỳ (${s.scaleMax})`, 'GPA học kỳ (4)', `GPA tích lũy (${s.scaleMax})`, 'GPA tích lũy (4)'], 1, 44);
  const tFirst = r + 1;
  for (let t = 0; t <= lastTerm; t++) {
    r++;
    const z = t % 2 === 1;
    const ts = terms[t];
    const cs = cum[t];
    ov.cell(r, 1, termLabel(t, s), body({}, z));
    ov.cell(r, 2, ts?.courses ?? 0, body({ align: 'center' }, z));
    ov.cell(r, 3, ts?.credits ?? 0, body({ align: 'center', numFmt: '0.##' }, z));
    ov.cell(r, 4, ts?.gpa10 ?? null, body({ align: 'center', numFmt: gd }, z));
    ov.cell(r, 5, ts?.gpa4 ?? null, body({ align: 'center', numFmt: gd }, z));
    ov.cell(r, 6, cs?.gpa10 ?? null, body({ align: 'center', numFmt: gd }, z));
    ov.cell(r, 7, cs?.gpa4 ?? null, body({ align: 'center', numFmt: gd }, z));
  }
  const tLast = r;
  r += 2;
  ov.cell(r, 1, 'GPA THEO NĂM HỌC', S.section);
  r++;
  headerRow(ov, r, ['Năm học', `GPA năm (${s.scaleMax})`, 'GPA năm (4)', `Tích lũy cuối năm (${s.scaleMax})`], 1, 44);
  const yFirst = r + 1;
  const lastYear = Math.floor(lastTerm / Math.max(1, s.termsPerYear));
  const yearCum: (number | null)[] = [];
  for (let y = 0; y <= lastYear; y++) {
    r++;
    const z = y % 2 === 1;
    let cv: number | null = null;
    for (let t = y * s.termsPerYear; t < (y + 1) * s.termsPerYear; t++) if (cum[t]?.gpa10 != null) cv = cum[t].gpa10;
    yearCum.push(cv);
    ov.cell(r, 1, `${s.yearLabel} ${y + 1}`, body({}, z));
    ov.cell(r, 2, years[y]?.gpa10 ?? null, body({ align: 'center', numFmt: gd }, z));
    ov.cell(r, 3, years[y]?.gpa4 ?? null, body({ align: 'center', numFmt: gd }, z));
    ov.cell(r, 4, cv, body({ align: 'center', numFmt: gd }, z));
  }
  const yLast = r;

  const sn = ov.name;
  const cats = Array.from({ length: lastTerm + 1 }, (_, t) => termLabel(t, s));
  const chart1: LineChartSpec = {
    title: 'GPA theo học kỳ (tiến trình điểm số)',
    from: { col: 8, row: 3 },
    to: { col: 17, row: 20 },
    yMin: 0,
    yMax: s.scaleMax,
    series: [
      { name: `GPA học kỳ (${s.scaleMax})`, nameRef: absRef(sn, tHead, 4), catRef: absRef(sn, tFirst, 1, tLast, 1), valRef: absRef(sn, tFirst, 4, tLast, 4), cats, vals: cats.map((_, t) => terms[t]?.gpa10 ?? null), color: TEAL },
      { name: `GPA tích lũy (${s.scaleMax})`, nameRef: absRef(sn, tHead, 6), catRef: absRef(sn, tFirst, 1, tLast, 1), valRef: absRef(sn, tFirst, 6, tLast, 6), cats, vals: cats.map((_, t) => cum[t]?.gpa10 ?? null), color: 'B8700A', marker: 'diamond' },
    ],
  };
  const ycats = Array.from({ length: lastYear + 1 }, (_, y) => `${s.yearLabel} ${y + 1}`);
  const chart2: LineChartSpec = {
    title: 'GPA theo năm học',
    from: { col: 8, row: 21 },
    to: { col: 17, row: 38 },
    yMin: 0,
    yMax: s.scaleMax,
    series: [
      { name: `GPA năm (${s.scaleMax})`, nameRef: absRef(sn, yFirst - 1, 2), catRef: absRef(sn, yFirst, 1, yLast, 1), valRef: absRef(sn, yFirst, 2, yLast, 2), cats: ycats, vals: ycats.map((_, y) => years[y]?.gpa10 ?? null), color: TEAL },
      { name: `Tích lũy cuối năm (${s.scaleMax})`, nameRef: absRef(sn, yFirst - 1, 4), catRef: absRef(sn, yFirst, 1, yLast, 1), valRef: absRef(sn, yFirst, 4, yLast, 4), cats: ycats, vals: yearCum, color: 'B8700A', marker: 'diamond' },
    ],
  };
  if (ev.length) ov.addChart(chart1).addChart(chart2);

  /* ===== Bảng điểm ===== */
  const bd = wb.addSheet('Bảng điểm').tab('3D8FAE');
  const bh = ['STT', 'Học kỳ', 'Mã học phần', 'Học phần', 'Số tín chỉ', 'Giảng viên', 'Tính GPA', 'Cách tính (thành phần và trọng số)', 'Điểm tiến trình', 'Điểm cộng', `Tổng kết (thang ${s.scaleMax})`, 'Thang 4', 'Điểm chữ', 'Xếp loại', 'Tín chỉ đạt', 'Trạng thái', 'Ghi chú'];
  titleBlock(bd, data, bh.length, 'BẢNG ĐIỂM CHI TIẾT TỪNG HỌC PHẦN');
  [6, 18, 20, 36, 9, 22, 11, 52, 11, 9, 13, 9, 9, 12, 9, 40, 28].forEach((w, i) => bd.width(i + 1, w));
  headerRow(bd, 5, bh, 1, 46);
  const sorted = [...ev].sort((a, b) => a.course.term - b.course.term);
  const GPA_TXT = { yes: 'Có', no: 'Không', pass: 'P' } as const;
  sorted.forEach(({ course: c, result: res }, i) => {
    const row = 6 + i;
    const z = i % 2 === 1;
    const failed = res.passed === false;
    bd.cell(row, 1, i + 1, body({ align: 'center' }, z));
    bd.cell(row, 2, termLabel(c.term, s), body({}, z));
    bd.cell(row, 3, c.code, body({}, z));
    bd.cell(row, 4, c.name, body({ bold: true, wrap: true }, z));
    bd.cell(row, 5, c.credits, body({ align: 'center', numFmt: '0.##' }, z));
    bd.cell(row, 6, c.instructor, body({ wrap: true }, z));
    bd.cell(row, 7, GPA_TXT[c.gpaMode], body({ align: 'center' }, z));
    bd.cell(row, 8, componentSummary(c, res), body({ wrap: true }, z));
    bd.cell(row, 9, res.mode === 'progress' ? c.progress : null, body({ align: 'center', numFmt: cd }, z));
    bd.cell(row, 10, res.bonusApplied || null, body({ align: 'center', numFmt: cd }, z));
    bd.cell(row, 11, res.total, body({ align: 'center', bold: true, numFmt: cd, color: failed ? 'B3261E' : INK }, z));
    bd.cell(row, 12, res.gpa4, body({ align: 'center', numFmt: '0.0' }, z));
    bd.cell(row, 13, res.letter, body({ align: 'center', bold: true, color: failed ? 'B3261E' : TEAL }, z));
    bd.cell(row, 14, res.classification, body({ align: 'center' }, z));
    bd.cell(row, 15, res.creditsEarned, body({ align: 'center', numFmt: '0.##' }, z));
    bd.cell(row, 16, res.status.message, body({ wrap: true, bg: STATUS_BG[res.status.level], color: STATUS_FG[res.status.level] }));
    bd.cell(row, 17, c.note, body({ wrap: true }, z));
    bd.height(row, Math.max(22, Math.ceil(componentSummary(c, res).length / 55) * 17 + 6));
  });
  if (!sorted.length) bd.cell(6, 1, 'Chưa có học phần nào.', S.sub);
  bd.freeze(5, 0);
  if (sorted.length) bd.filter(5, 1, 5 + sorted.length, bh.length);

  /* ===== Chi tiết thành phần ===== */
  const ct = wb.addSheet('Chi tiết thành phần').tab('7AB6CD');
  const ch = ['Học kỳ', 'Mã học phần', 'Học phần', 'Thành phần', 'Tính', 'Trọng số (%)', 'Gộp với dòng trên', 'Điểm', 'Đóng góp vào tổng kết', 'Ghi chú'];
  titleBlock(ct, data, ch.length, 'CHI TIẾT THÀNH PHẦN ĐIỂM');
  [18, 20, 34, 24, 8, 12, 12, 9, 15, 34].forEach((w, i) => ct.width(i + 1, w));
  headerRow(ct, 5, ch, 1, 40);
  let cr = 5;
  let zi = 0;
  for (const { course: c, result: res } of sorted) {
    const leaderOf = new Map<string, string>();
    const groupOf = new Map<string, (typeof res.groups)[number]>();
    for (const g of res.groups) for (const m of g.memberIds) { leaderOf.set(m, g.id); groupOf.set(m, g); }
    const base = (z: boolean) => ({ term: termLabel(c.term, s), z });
    if (res.mode === 'progress' && c.progress !== null) {
      cr++;
      const z = zi++ % 2 === 1;
      ct.cell(cr, 1, base(z).term, body({}, z)).cell(cr, 2, c.code, body({}, z)).cell(cr, 3, c.name, body({ wrap: true }, z)).cell(cr, 4, 'Điểm tiến trình', body({ bold: true }, z));
      ct.cell(cr, 5, 'Có', body({ align: 'center' }, z)).cell(cr, 6, null, body({}, z)).cell(cr, 7, null, body({}, z));
      ct.cell(cr, 8, c.progress, body({ align: 'center', numFmt: cd }, z)).cell(cr, 9, c.progress, body({ align: 'center', numFmt: cd }, z)).cell(cr, 10, 'Đã nhân trọng số', body({}, z));
    }
    for (const k of c.components) {
      cr++;
      const z = zi++ % 2 === 1;
      const g = groupOf.get(k.id);
      const follower = !!g && leaderOf.get(k.id) !== k.id;
      let note = '';
      if (!k.enabled) note = 'Không tính cho môn này';
      else if (g?.ignored) note = 'Đã gồm trong điểm tiến trình';
      else if (follower) note = 'Cùng nhóm với thành phần phía trên';
      else if (g?.isFinal) note = 'Điểm cuối kỳ';
      else if (!g) note = res.unweightedIds.includes(k.id) ? 'Chưa có trọng số' : 'Bỏ qua (0%)';
      ct.cell(cr, 1, termLabel(c.term, s), body({}, z)).cell(cr, 2, c.code, body({}, z)).cell(cr, 3, c.name, body({ wrap: true }, z)).cell(cr, 4, k.name, body({}, z));
      ct.cell(cr, 5, k.enabled ? 'Có' : 'Không', body({ align: 'center', color: k.enabled ? INK : '8A97A3' }, z));
      ct.cell(cr, 6, follower ? 'dùng chung' : g ? Math.round(g.weight * 10000) / 100 : k.weight === null ? null : Math.round(k.weight * 10000) / 100, body({ align: 'center' }, z));
      ct.cell(cr, 7, k.joinPrev ? 'Có' : '', body({ align: 'center' }, z));
      ct.cell(cr, 8, k.score, body({ align: 'center', numFmt: cd }, z));
      ct.cell(cr, 9, g && !follower && !g.ignored && g.score !== null ? g.contribution : null, body({ align: 'center', numFmt: cd }, z));
      ct.cell(cr, 10, note, body({}, z));
    }
  }
  ct.freeze(5, 0);
  if (cr > 5) ct.filter(5, 1, cr, ch.length);

  /* ===== Mục tiêu ===== */
  const tg = wb.addSheet('Mục tiêu điểm').tab('9B1313');
  const tcols = 14;
  titleBlock(tg, data, tcols, 'MỤC TIÊU ĐIỂM SỐ TỪNG HỌC PHẦN');
  [6, 20, 36, 18, 11, 11, 11, 11, 11, 11, 11, 11, 11, 32].forEach((w, i) => tg.width(i + 1, w));
  const g1 = (a: number, b: number, t: string) => { tg.cell(5, a, t, S.group).fill(5, a, 5, b, S.group).merge(5, a, 5, b); };
  tg.cell(5, 1, null, S.group).fill(5, 1, 5, 4, S.group);
  g1(5, 7, 'Nhập mục tiêu (1 trong 3 thang)');
  g1(8, 10, 'Quy đổi tự động');
  g1(12, 13, 'Cần đạt (chữ đỏ đậm)');
  headerRow(tg, 6, ['STT', 'Mã môn', 'Tên học phần', 'Khớp học kỳ', `Thang ${s.scaleMax}`, 'Thang 4', 'Điểm chữ', `Thang ${s.scaleMax}`, 'Thang 4', 'Điểm chữ', 'Hiện tại', 'Tiến trình', 'Cuối kỳ', 'Tình trạng'], 1, 34);
  sorted.forEach(({ course: c, result: res }, i) => {
    const row = 7 + i;
    const z = i % 2 === 1;
    const tgt = effectiveTarget(c.target, s);
    const h = computeHints(c, res, s);
    let state = 'Chưa đặt mục tiêu';
    if (tgt) {
      if (res.total !== null && res.total >= tgt.t10 - 1e-9) state = 'Đã đạt mục tiêu';
      else if (h.final?.kind === 'impossible' || h.progress?.kind === 'impossible') state = 'Không thể đạt với điểm hiện tại';
      else if (h.final || h.progress) state = 'Đang theo dõi';
      else state = 'Chưa đủ dữ liệu để gợi ý';
    }
    const need = (hh: typeof h.final): CellValue => (!hh ? null : hh.kind === 'exact' ? hh.value : hintText(hh));
    tg.cell(row, 1, i + 1, body({ align: 'center' }, z)).cell(row, 2, c.code, body({}, z)).cell(row, 3, c.name, body({ bold: true, wrap: true }, z)).cell(row, 4, `Khớp: ${termLabel(c.term, s)}`, body({}, z));
    const input = { align: 'center', color: '1D4ED8', bg: 'FFF8DC', numFmt: cd } as Style;
    tg.cell(row, 5, c.target.t10, body(input)).cell(row, 6, c.target.t4, body({ ...input, numFmt: '0.0' })).cell(row, 7, c.target.letter || null, body({ ...input, numFmt: undefined }));
    tg.cell(row, 8, tgt?.t10 ?? null, body({ align: 'center', numFmt: cd }, z)).cell(row, 9, tgt?.gpa4 ?? null, body({ align: 'center', numFmt: '0.0' }, z)).cell(row, 10, tgt?.letter ?? null, body({ align: 'center', bold: true }, z));
    tg.cell(row, 11, res.total, body({ align: 'center', bold: true, numFmt: cd }, z));
    tg.cell(row, 12, need(h.progress), body({ align: 'center', bold: true, color: HINT, numFmt: '0.00' }, z));
    tg.cell(row, 13, need(h.final), body({ align: 'center', bold: true, color: HINT, numFmt: '0.00' }, z));
    tg.cell(row, 14, state, body({ wrap: true, bg: state === 'Đã đạt mục tiêu' ? STATUS_BG.ok : state.startsWith('Không thể') ? STATUS_BG.error : STATUS_BG.info }));
  });
  if (!sorted.length) tg.cell(7, 1, 'Chưa có học phần nào.', S.sub);
  tg.freeze(6, 0);

  /* ===== Cấu hình ===== */
  const cf = wb.addSheet('Cấu hình').tab('566677');
  titleBlock(cf, data, 5, 'CẤU HÌNH ĐANG DÙNG');
  [34, 16, 14, 18, 3].forEach((w, i) => cf.width(i + 1, w));
  const kv: [string, CellValue][] = [
    ['Thang điểm tối đa', s.scaleMax],
    ['Số chữ số thập phân của điểm môn', s.courseDecimals],
    ['Số chữ số thập phân của GPA', s.gpaDecimals],
    ['Điểm đạt học phần', s.passScore],
    ['Điểm đạt môn chỉ cần Đạt', s.passOnlyScore],
    ['Môn không đạt vẫn tính vào GPA', s.failCountsInGpa ? 'Có' : 'Không'],
    ['Mặc định cộng điểm thưởng', s.bonusDefault ? 'Có' : 'Không'],
    ['Số học kỳ', s.termCount],
    ['Số học kỳ mỗi năm', s.termsPerYear],
    ['Ký hiệu Đạt', s.passSymbol],
    ['Ký hiệu Không đạt', s.failSymbol],
  ];
  kv.forEach(([k, v], i) => cf.cell(5 + i, 1, k, body({ bold: true, bg: 'DCECF3' })).cell(5 + i, 2, v, body({ align: 'center' })));
  let q = 5 + kv.length + 1;
  cf.cell(q, 1, 'BẢNG QUY ĐỔI ĐIỂM', S.section);
  q++;
  headerRow(cf, q, ['Từ điểm (≥)', 'Điểm chữ', 'Thang 4', 'Xếp loại'], 1, 26);
  s.conversion.forEach((c, i) => {
    q++;
    const z = i % 2 === 1;
    cf.cell(q, 1, c.from, body({ align: 'center' }, z)).cell(q, 2, c.letter, body({ align: 'center', bold: true }, z)).cell(q, 3, c.gpa4, body({ align: 'center', numFmt: '0.0' }, z)).cell(q, 4, c.rank, body({ align: 'center' }, z));
  });

  /* ===== Thông tin ngành học ===== */
  const pg = wb.addSheet('Thông tin ngành học').tab('5E8C61');
  titleBlock(pg, data, 9, 'CHƯƠNG TRÌNH ĐÀO TẠO');
  [7, 14, 34, 7, 22, 20, 20, 20, 30].forEach((w, i) => pg.width(i + 1, w));
  headerRow(pg, 5, ['STT', 'Mã môn', 'Tên môn', 'TC', 'Giảng viên', 'Kiểm tra', 'Giữa kỳ', 'Cuối kỳ', 'Ghi chú'], 1, 26);
  let pr = 5;
  for (let t = 0; t < s.termCount; t++) {
    const rows = data.program.filter((x) => x.term === t);
    if (!rows.length) continue;
    pr++;
    pg.cell(pr, 1, termLabel(t, s), S.section);
    rows.forEach((x, i) => {
      pr++;
      const z = i % 2 === 1;
      const b = body({}, z);
      pg.cell(pr, 1, i + 1, body({ align: 'center' }, z)).cell(pr, 2, x.code, b).cell(pr, 3, x.name, b).cell(pr, 4, x.credits ?? '', body({ align: 'center' }, z))
        .cell(pr, 5, x.instructor, b).cell(pr, 6, x.test, b).cell(pr, 7, x.midterm, b).cell(pr, 8, x.final, b).cell(pr, 9, x.note, body({ wrap: true }, z));
    });
  }
  if (pr === 5) pg.cell(6, 1, 'Chưa nhập chương trình đào tạo.', S.sub);
  pg.freeze(5, 0);

  return wb;
}

export function toXlsx(data: AppData): Uint8Array {
  return buildWorkbook(data).build();
}
