/**
 * Kiểm tra và làm sạch dữ liệu đọc từ localStorage hoặc file JSON nhập vào.
 * Không tin bất kỳ trường nào: ép kiểu, giới hạn độ dài, giới hạn số lượng, tạo lại id trùng.
 */
import type { AppData, Course, CourseComponent, ConversionRow, ProgramCourse, Settings } from './types';
import { DEFAULT_COMPONENT_LIBRARY, DEFAULT_CONVERSION, defaultData, defaultSettings } from './defaults';
import { newId } from './id';

export const LIMITS = { program: 300, courses: 500, components: 12, library: 30, conversion: 20, text: 200, note: 1000, terms: 24 };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, max = LIMITS.text): string => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
const numOr = (v: unknown, min: number, max: number, d: number): number => num(v, min, max) ?? d;
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (list.includes(v as T) ? (v as T) : d);

export function sanitizeConversion(v: unknown, warnings: string[]): ConversionRow[] {
  if (!Array.isArray(v)) return DEFAULT_CONVERSION.map((r) => ({ ...r }));
  const rows: ConversionRow[] = [];
  for (const r of v.slice(0, LIMITS.conversion)) {
    if (!isRec(r)) continue;
    const from = num(r.from, 0, 1000);
    const gpa4 = num(r.gpa4, 0, 100);
    const letter = str(r.letter, 6);
    if (from === null || gpa4 === null || !letter) continue;
    rows.push({ from, gpa4, letter, rank: str(r.rank, 40) });
  }
  rows.sort((a, b) => a.from - b.from);
  if (!rows.length || rows[0].from !== 0) {
    warnings.push('Bảng quy đổi không hợp lệ, đã dùng bảng mặc định.');
    return DEFAULT_CONVERSION.map((r) => ({ ...r }));
  }
  return rows;
}

export function sanitizeSettings(v: unknown, warnings: string[]): Settings {
  const d = defaultSettings();
  if (!isRec(v)) return d;
  const termsPerYear = Math.round(numOr(v.termsPerYear, 1, 4, d.termsPerYear));
  const termNamesRaw = Array.isArray(v.termNames) ? v.termNames.slice(0, 4).map((x) => str(x, 20)) : d.termNames;
  const termNames = [0, 1, 2, 3].map((i) => termNamesRaw[i] || d.termNames[i]);
  const st = isRec(v.student) ? v.student : {};
  return {
    scaleMax: numOr(v.scaleMax, 1, 1000, d.scaleMax),
    courseDecimals: Math.round(numOr(v.courseDecimals, 0, 3, d.courseDecimals)),
    gpaDecimals: Math.round(numOr(v.gpaDecimals, 0, 4, d.gpaDecimals)),
    passScore: numOr(v.passScore, 0, 1000, d.passScore),
    failCountsInGpa: bool(v.failCountsInGpa, d.failCountsInGpa),
    bonusDefault: bool(v.bonusDefault, d.bonusDefault),
    passOnlyScore: numOr(v.passOnlyScore, 0, 1000, d.passOnlyScore),
    passSymbol: str(v.passSymbol, 4) || d.passSymbol,
    failSymbol: str(v.failSymbol, 4) || d.failSymbol,
    termCount: Math.round(numOr(v.termCount, 1, LIMITS.terms, d.termCount)),
    termsPerYear,
    yearLabel: str(v.yearLabel, 20) || d.yearLabel,
    termNames,
    conversion: sanitizeConversion(v.conversion, warnings),
    student: { name: str(st.name), id: str(st.id, 40), school: str(st.school), major: str(st.major) },
  };
}

function sanitizeComponent(v: unknown, seen: Set<string>): CourseComponent | null {
  if (!isRec(v)) return null;
  let id = str(v.id, 60);
  if (!id || seen.has(id)) id = newId('cmp');
  seen.add(id);
  return {
    id,
    name: str(v.name, 60) || 'Thành phần',
    enabled: bool(v.enabled, true),
    weight: num(v.weight, 0, 1),
    joinPrev: bool(v.joinPrev, false),
    score: num(v.score, 0, 1000),
  };
}

function sanitizeCourse(v: unknown, s: Settings, seen: Set<string>): Course | null {
  if (!isRec(v)) return null;
  let id = str(v.id, 60);
  if (!id || seen.has(id)) id = newId('crs');
  seen.add(id);
  const cseen = new Set<string>();
  const comps = (Array.isArray(v.components) ? v.components : [])
    .slice(0, LIMITS.components)
    .map((c) => sanitizeComponent(c, cseen))
    .filter((c): c is CourseComponent => c !== null);
  const t = isRec(v.target) ? v.target : {};
  return {
    id,
    code: str(v.code, 40),
    name: str(v.name),
    credits: num(v.credits, 0, 100),
    term: Math.round(numOr(v.term, 0, LIMITS.terms - 1, 0)),
    instructor: str(v.instructor),
    note: str(v.note, LIMITS.note),
    gpaMode: oneOf(v.gpaMode, ['yes', 'no', 'pass'] as const, 'yes'),
    bonus: num(v.bonus, 0, 1000),
    bonusMode: oneOf(v.bonusMode, ['default', 'yes', 'no'] as const, 'default'),
    useProgress: bool(v.useProgress, false),
    progress: num(v.progress, 0, 1000),
    components: comps,
    target: { t10: num(t.t10, 0, 1000), t4: num(t.t4, 0, 100), letter: str(t.letter, 6) },
  };
}

export interface SanitizeResult {
  data: AppData;
  warnings: string[];
}

function sanitizeProgram(v: unknown, s: Settings, seen: Set<string>): ProgramCourse | null {
  if (!isRec(v)) return null;
  let id = str(v.id, 60);
  if (!id || seen.has(id)) id = newId('prg');
  seen.add(id);
  const term = Math.trunc(numOr(v.term, 0, LIMITS.terms - 1, 0));
  return {
    id,
    term: Math.min(term, Math.max(0, s.termCount - 1)),
    code: str(v.code, 30),
    name: str(v.name),
    credits: num(v.credits, 0, 50),
    instructor: str(v.instructor),
    test: str(v.test, 60),
    midterm: str(v.midterm, 60),
    final: str(v.final, 60),
    note: str(v.note, LIMITS.note),
  };
}

export function sanitizeAppData(raw: unknown): SanitizeResult {
  const warnings: string[] = [];
  if (!isRec(raw)) throw new Error('Tệp không phải dữ liệu hợp lệ.');
  if (raw.version !== 1) throw new Error('Phiên bản dữ liệu không được hỗ trợ.');
  const settings = sanitizeSettings(raw.settings, warnings);
  const lib = (Array.isArray(raw.componentLibrary) ? raw.componentLibrary : DEFAULT_COMPONENT_LIBRARY)
    .slice(0, LIMITS.library)
    .map((x) => str(x, 60))
    .filter(Boolean);
  const rawCourses = Array.isArray(raw.courses) ? raw.courses : [];
  if (rawCourses.length > LIMITS.courses) warnings.push(`Chỉ nhập ${LIMITS.courses} môn đầu tiên.`);
  const seen = new Set<string>();
  const courses = rawCourses
    .slice(0, LIMITS.courses)
    .map((c) => sanitizeCourse(c, settings, seen))
    .filter((c): c is Course => c !== null);
  const dropped = Math.min(rawCourses.length, LIMITS.courses) - courses.length;
  if (dropped > 0) warnings.push(`Bỏ qua ${dropped} môn không đọc được.`);
  const pseen = new Set<string>();
  const program = (Array.isArray(raw.program) ? raw.program : [])
    .slice(0, LIMITS.program)
    .map((p) => sanitizeProgram(p, settings, pseen))
    .filter((p): p is ProgramCourse => p !== null);
  return { data: { version: 1, settings, componentLibrary: lib.length ? lib : [...DEFAULT_COMPONENT_LIBRARY], courses, program }, warnings };
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function parseImport(text: string): SanitizeResult {
  if (text.length > MAX_IMPORT_BYTES) throw new Error('Tệp quá lớn (tối đa 2 MB).');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('Tệp không phải JSON hợp lệ.');
  }
  return sanitizeAppData(raw);
}

export { defaultData };
