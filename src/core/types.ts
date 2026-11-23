/** Kiểu dữ liệu dùng chung. Mọi trọng số lưu dạng phân số (0.3 = 30%). */

export type GpaMode = 'yes' | 'no' | 'pass';
export type BonusMode = 'default' | 'yes' | 'no';

export interface ConversionRow {
  /** Điểm thang gốc từ mức này trở lên (>=). Dòng đầu phải bằng 0. */
  from: number;
  letter: string;
  gpa4: number;
  rank: string;
}

export interface Settings {
  scaleMax: number;
  courseDecimals: number;
  gpaDecimals: number;
  /** Điểm tối thiểu để đạt học phần (tính tín chỉ đã đạt). */
  passScore: number;
  failCountsInGpa: boolean;
  bonusDefault: boolean;
  /** Ngưỡng cho học phần chỉ cần đạt (chọn "P"). */
  passOnlyScore: number;
  passSymbol: string;
  failSymbol: string;
  termCount: number;
  termsPerYear: number;
  yearLabel: string;
  termNames: string[];
  conversion: ConversionRow[];
  student: { name: string; id: string; school: string; major: string };
}

export interface CourseComponent {
  id: string;
  name: string;
  /** Tắt = thành phần không tính cho môn này. */
  enabled: boolean;
  /** Trọng số riêng; null = chưa đặt; 0 = bỏ qua. */
  weight: number | null;
  /** Dùng chung trọng số với thành phần đang bật ngay phía trên. */
  joinPrev: boolean;
  score: number | null;
}

export interface Target {
  t10: number | null;
  t4: number | null;
  letter: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  /** Chỉ số học kỳ, tính từ 0. */
  term: number;
  instructor: string;
  note: string;
  gpaMode: GpaMode;
  bonus: number | null;
  bonusMode: BonusMode;
  /** Bật = dùng điểm tiến trình đã quy đổi thay cho các thành phần trước cuối kỳ. */
  useProgress: boolean;
  progress: number | null;
  components: CourseComponent[];
  target: Target;
}

export interface AppData {
  version: 1;
  settings: Settings;
  componentLibrary: string[];
  courses: Course[];
}

export type Level = 'ok' | 'info' | 'warn' | 'error';

export interface Status {
  level: Level;
  code: string;
  message: string;
}

export interface Group {
  /** Id của thành phần đầu nhóm. */
  id: string;
  memberIds: string[];
  weight: number;
  scores: number[];
  score: number | null;
  contribution: number;
  isFinal: boolean;
  /** Trong chế độ tiến trình, nhóm trước cuối kỳ bị bỏ qua. */
  ignored: boolean;
}

export interface CourseResult {
  groups: Group[];
  finalGroup: Group | null;
  mode: 'components' | 'progress';
  weightSum: number;
  bonusApplied: number;
  total: number | null;
  rank: number | null;
  letter: string;
  gpa4: number | null;
  classification: string;
  passed: boolean | null;
  countsGpa: boolean;
  creditsEarned: number;
  status: Status;
  /** Thành phần có điểm nhưng không có nhóm trọng số, hoặc chưa đặt trọng số. */
  unweightedIds: string[];
  /** Id thành phần có điểm/trọng số lỗi, để giao diện tô đỏ. */
  badIds: string[];
}

export interface Hint {
  kind: 'exact' | 'min' | 'done' | 'impossible';
  value: number | null;
}

export interface EffectiveTarget {
  t10: number;
  rank: number;
  letter: string;
  gpa4: number;
  multi: boolean;
}

export interface TargetHints {
  progress: Hint | null;
  final: Hint | null;
  finalGroupId: string | null;
}

export interface TermStat {
  term: number;
  year: number;
  gpa10: number | null;
  gpa4: number | null;
  credits: number;
  courses: number;
}
export interface YearStat {
  year: number;
  gpa10: number | null;
  gpa4: number | null;
}
export interface Totals {
  gpa10: number | null;
  gpa4: number | null;
  registered: number;
  earned: number;
  courses: number;
  graded: number;
}
