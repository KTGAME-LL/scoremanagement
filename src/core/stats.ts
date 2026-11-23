import type { AppData, Course, CourseResult, Settings, TermStat, Totals, YearStat } from './types';
import { computeCourse, roundHalfUp } from './compute';

export interface Evaluated {
  course: Course;
  result: CourseResult;
}

export function evaluateAll(data: AppData): Evaluated[] {
  return data.courses.map((course) => ({ course, result: computeCourse(course, data.settings) }));
}

const yearOf = (term: number, s: Settings) => Math.floor(term / Math.max(1, s.termsPerYear));

function gpaOf(list: Evaluated[], s: Settings): { g10: number | null; g4: number | null; credits: number } {
  let c = 0,
    n10 = 0,
    n4 = 0;
  for (const { course, result } of list) {
    if (!result.countsGpa || result.total === null || result.gpa4 === null) continue;
    const cr = course.credits as number;
    if (cr <= 0) continue;
    c += cr;
    n10 += result.total * cr;
    n4 += result.gpa4 * cr;
  }
  if (c <= 0) return { g10: null, g4: null, credits: 0 };
  return { g10: roundHalfUp(n10 / c, s.gpaDecimals), g4: roundHalfUp(n4 / c, s.gpaDecimals), credits: c };
}

export function termStats(ev: Evaluated[], s: Settings): TermStat[] {
  const out: TermStat[] = [];
  for (let t = 0; t < s.termCount; t++) {
    const list = ev.filter((e) => e.course.term === t);
    const g = gpaOf(list, s);
    out.push({ term: t, year: yearOf(t, s), gpa10: g.g10, gpa4: g.g4, credits: g.credits, courses: list.length });
  }
  return out;
}

export function yearStats(ev: Evaluated[], s: Settings): YearStat[] {
  const years = Math.ceil(s.termCount / Math.max(1, s.termsPerYear));
  const out: YearStat[] = [];
  for (let y = 0; y < years; y++) {
    const g = gpaOf(ev.filter((e) => yearOf(e.course.term, s) === y && e.course.term < s.termCount), s);
    out.push({ year: y, gpa10: g.g10, gpa4: g.g4 });
  }
  return out;
}

/** GPA tích lũy tính đến hết từng học kỳ. */
export function cumulativeByTerm(ev: Evaluated[], s: Settings): { term: number; gpa10: number | null; gpa4: number | null }[] {
  const out = [];
  for (let t = 0; t < s.termCount; t++) {
    const g = gpaOf(ev.filter((e) => e.course.term <= t), s);
    out.push({ term: t, gpa10: g.g10, gpa4: g.g4 });
  }
  return out;
}

export function totals(ev: Evaluated[], s: Settings): Totals {
  const inRange = ev.filter((e) => e.course.term < s.termCount);
  const g = gpaOf(inRange, s);
  return {
    gpa10: g.g10,
    gpa4: g.g4,
    registered: inRange.reduce((a, e) => a + (e.course.credits ?? 0), 0),
    earned: inRange.reduce((a, e) => a + e.result.creditsEarned, 0),
    courses: inRange.length,
    graded: inRange.filter((e) => e.result.total !== null).length,
  };
}

export function termLabel(term: number, s: Settings): string {
  const y = yearOf(term, s) + 1;
  const name = s.termNames[term % Math.max(1, s.termsPerYear)] || `HK${(term % s.termsPerYear) + 1}`;
  return `${s.yearLabel} ${y} · ${name}`;
}
