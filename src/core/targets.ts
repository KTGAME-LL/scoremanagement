import type { Course, CourseResult, EffectiveTarget, Hint, Settings, Target, TargetHints } from './types';
import { bandIndex, bandTop, roundHalfUp, roundUp } from './compute';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Quy đổi mục tiêu: nhập 1 trong 3 thang, các thang còn lại hiện ở mức cao nhất tương ứng.
 * Nhập nhiều thang thì lấy mức cao nhất.
 */
export function effectiveTarget(t: Target, s: Settings): EffectiveTarget | null {
  const conv = s.conversion;
  if (!conv.length) return null;
  const cands: number[] = [];
  if (isNum(t.t10)) cands.push(Math.min(s.scaleMax, Math.max(0, t.t10)));
  if (isNum(t.t4)) {
    let idx = 0;
    for (const r of conv) if (r.gpa4 <= t.t4 + 1e-9) idx++;
    if (idx >= 1) cands.push(bandTop(conv, idx, s));
  }
  const letter = t.letter.trim().toLowerCase();
  if (letter) {
    const idx = conv.findIndex((r) => r.letter.toLowerCase() === letter) + 1;
    if (idx >= 1) cands.push(bandTop(conv, idx, s));
  }
  if (!cands.length) return null;
  const t10 = roundHalfUp(Math.max(...cands), s.courseDecimals);
  const rank = Math.max(1, bandIndex(conv, t10));
  return { t10, rank, letter: conv[rank - 1].letter, gpa4: conv[rank - 1].gpa4, multi: cands.length > 1 };
}

function need(v: number, limit: number): Hint {
  if (v <= 0) return { kind: 'done', value: null };
  if (v > limit + 1e-9) return { kind: 'impossible', value: null };
  return { kind: 'exact', value: roundUp(v, 2) };
}

/**
 * Gợi ý điểm còn thiếu, bám công thức bảng Excel:
 * - điểm cuối kỳ cần đạt khi đã biết phần quá trình;
 * - điểm tiến trình (đã quy đổi) cần có khi đã có điểm cuối kỳ;
 * - mức tối thiểu ("min") khi cả hai chưa biết.
 */
export function computeHints(course: Course, res: CourseResult, s: Settings): TargetHints {
  const none: TargetHints = { progress: null, final: null, finalGroupId: res.finalGroup?.id ?? null };
  const tgt = effectiveTarget(course.target, s);
  const fg = res.finalGroup;
  if (!tgt || !fg || fg.weight <= 0 || course.gpaMode === 'pass') return none;

  const max = s.scaleMax;
  const wf = fg.weight;
  const sumW = res.groups.reduce((a, g) => a + g.weight, 0);
  const maxProc = Math.max(0, sumW - wf) * max;
  const bonus = res.bonusApplied;
  const T = tgt.t10;
  const finalScored = fg.score !== null;

  const nonFinal = res.groups.filter((g) => !g.isFinal);
  const progressActive = course.useProgress && isNum(course.progress);
  let K: number | null = null;
  if (progressActive) K = course.progress as number;
  else if (nonFinal.every((g) => g.score !== null)) K = nonFinal.reduce((a, g) => a + g.weight * (g.score as number), 0);

  let progress: Hint | null = null;
  let fin: Hint | null = null;

  if (!progressActive && K === null) {
    if (finalScored) {
      progress = need(T - wf * (fg.score as number) - bonus, maxProc);
    } else {
      const m = T - wf * max - bonus;
      if (m > 0) progress = { kind: 'min', value: roundUp(m, 2) };
    }
  }
  if (!finalScored) {
    if (K !== null) fin = need((T - K - bonus) / wf, max);
    else {
      const n = (T - maxProc - bonus) / wf;
      if (n > 0) fin = { kind: 'min', value: roundUp(n, 2) };
    }
  }
  return { progress, final: fin, finalGroupId: fg.id };
}

export function hintText(h: Hint | null): string {
  if (!h) return '';
  if (h.kind === 'done') return 'Đã đạt';
  if (h.kind === 'impossible') return 'Không thể';
  const v = String(h.value).replace('.', ',');
  return h.kind === 'min' ? `≥ ${v}` : v;
}
