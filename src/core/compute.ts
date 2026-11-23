import type { Course, CourseComponent, CourseResult, ConversionRow, Group, Settings, Status } from './types';

const EPS = 1e-9;

/** Làm tròn nửa lên, khử sai số số thực (giống ROUND của Excel ở mức dùng thực tế). */
export function roundHalfUp(x: number, d: number): number {
  const f = 10 ** d;
  return Math.round(parseFloat((x * f).toPrecision(12))) / f;
}
export function roundUp(x: number, d: number): number {
  const f = 10 ** d;
  return Math.ceil(parseFloat((x * f).toPrecision(12)) - 1e-9) / f;
}

/** Số dòng quy đổi có "từ" <= điểm (bảng đã sắp tăng dần). Trả về 1-based. */
export function bandIndex(conv: ConversionRow[], score: number): number {
  let n = 0;
  for (const r of conv) if (r.from <= score + EPS) n++;
  return n;
}

/** Đầu trên của khoảng điểm thứ idx (1-based). */
export function bandTop(conv: ConversionRow[], idx: number, s: Pick<Settings, 'courseDecimals' | 'scaleMax'>): number {
  const next = conv[idx];
  return next ? roundHalfUp(next.from - 10 ** -s.courseDecimals, s.courseDecimals) : s.scaleMax;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

interface BuiltGroup {
  head: CourseComponent;
  members: CourseComponent[];
  weight: number;
}

/** Gom các thành phần đang bật thành nhóm trọng số, theo thứ tự hiển thị. */
export function buildGroups(course: Course): { groups: BuiltGroup[]; unweighted: CourseComponent[] } {
  const groups: BuiltGroup[] = [];
  const unweighted: CourseComponent[] = [];
  let cur: BuiltGroup | null = null;
  for (const c of course.components) {
    if (!c.enabled) continue;
    if (c.joinPrev && cur) {
      cur.members.push(c);
      continue;
    }
    if (isNum(c.weight) && c.weight > 0) {
      cur = { head: c, members: [c], weight: c.weight };
      groups.push(cur);
      continue;
    }
    cur = null;
    if (!(isNum(c.weight) && c.weight === 0)) unweighted.push(c);
  }
  return { groups, unweighted };
}

function status(level: Status['level'], code: string, message: string): Status {
  return { level, code, message };
}

export function computeCourse(course: Course, s: Settings): CourseResult {
  const max = s.scaleMax;
  const { groups: built, unweighted } = buildGroups(course);
  const active = course.components.filter((c) => c.enabled);
  const progressMode = course.useProgress && isNum(course.progress);
  const finalIdx = built.length - 1;

  const groups: Group[] = built.map((g, i) => {
    const scores = g.members.map((m) => m.score).filter(isNum);
    const score = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const isFinal = i === finalIdx;
    const ignored = progressMode && !isFinal;
    return {
      id: g.head.id,
      memberIds: g.members.map((m) => m.id),
      weight: g.weight,
      scores,
      score,
      contribution: score !== null && !ignored ? g.weight * score : 0,
      isFinal,
      ignored,
    };
  });
  const finalGroup = groups.length ? groups[finalIdx] : null;
  const weightSum = groups.reduce((a, g) => a + g.weight, 0);
  const bonusApplied =
    course.bonusMode === 'yes' || (course.bonusMode === 'default' && s.bonusDefault) ? (isNum(course.bonus) ? course.bonus : 0) : 0;

  const unweightedIds = unweighted.filter((c) => isNum(c.score)).map((c) => c.id);
  const badIds: string[] = [];
  for (const c of active) {
    if (isNum(c.score) && (c.score < 0 || c.score > max)) badIds.push(c.id);
    if (isNum(c.weight) && (c.weight < 0 || c.weight > 1)) badIds.push(c.id);
  }
  const progressBad = isNum(course.progress) && (course.progress < 0 || course.progress > max);
  const bonusBad = isNum(course.bonus) && (course.bonus < 0 || course.bonus > max);

  const base: CourseResult = {
    groups,
    finalGroup,
    mode: progressMode ? 'progress' : 'components',
    weightSum,
    bonusApplied,
    total: null,
    rank: null,
    letter: '',
    gpa4: null,
    classification: '',
    passed: null,
    countsGpa: false,
    creditsEarned: 0,
    status: status('info', 'empty', ''),
    unweightedIds,
    badIds,
  };

  // Thứ tự kiểm tra bám theo bảng Excel gốc.
  if (!course.name.trim()) return { ...base, status: status('error', 'no-name', 'Thiếu tên học phần') };
  if (!isNum(course.credits) || course.credits < 0) return { ...base, status: status('error', 'no-credits', 'Thiếu số tín chỉ') };
  if (badIds.length || progressBad || bonusBad)
    return { ...base, status: status('error', 'range', 'Điểm hoặc trọng số ngoài khoảng cho phép') };
  const anyScore = active.some((c) => isNum(c.score)) || progressMode || isNum(course.progress);
  if (!anyScore) {
    return { ...base, status: status('info', 'no-scores', 'Chưa nhập điểm') };
  }
  if (unweightedIds.length)
    return { ...base, status: status('error', 'unweighted-score', 'Có thành phần có điểm nhưng chưa có trọng số') };

  if (progressMode) {
    if (!finalGroup) return { ...base, status: status('error', 'no-final', 'Thiếu trọng số của thành phần cuối kỳ') };
    if (finalGroup.score === null) return { ...base, status: status('warn', 'missing', 'Chưa đủ điểm: còn thiếu điểm cuối kỳ') };
  } else {
    if (!groups.length) return { ...base, status: status('error', 'no-groups', 'Chưa có thành phần nào có trọng số') };
    if (Math.abs(weightSum - 1) > 1e-6) {
      return { ...base, status: status('error', 'weight-sum', `Tổng trọng số là ${roundHalfUp(weightSum * 100, 2)}%, cần đúng 100%`) };
    }
    const missing = groups.filter((g) => g.score === null);
    if (missing.length) return { ...base, status: status('warn', 'missing', 'Chưa đủ điểm các thành phần có trọng số') };
  }

  const raw = groups.reduce((a, g) => a + g.contribution, 0) + (progressMode ? (course.progress as number) : 0) + bonusApplied;
  const total = Math.min(max, Math.max(0, roundHalfUp(raw, s.courseDecimals)));

  let rank: number | null = null;
  let letter = '';
  let gpa4: number | null = null;
  let classification = '';
  let passed: boolean | null = null;
  if (course.gpaMode === 'pass') {
    passed = total >= s.passOnlyScore;
    letter = passed ? s.passSymbol : s.failSymbol;
    classification = passed ? 'Đạt' : 'Không đạt';
  } else {
    rank = Math.max(1, bandIndex(s.conversion, total));
    const row = s.conversion[rank - 1];
    letter = row?.letter ?? '';
    gpa4 = row?.gpa4 ?? null;
    classification = row?.rank ?? '';
    passed = total >= s.passScore;
  }
  const countsGpa =
    course.gpaMode === 'yes' && gpa4 !== null && (s.failCountsInGpa || total >= s.passScore);
  const creditsEarned = passed ? (course.credits as number) : 0;

  return {
    ...base,
    total,
    rank,
    letter,
    gpa4,
    classification,
    passed,
    countsGpa,
    creditsEarned,
    status: status('ok', 'ok', 'Hợp lệ'),
  };
}
