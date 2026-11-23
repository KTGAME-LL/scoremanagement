import type { AppData, Course, CourseComponent, Settings, ConversionRow } from './types';
import { newId } from './id';

export const DEFAULT_CONVERSION: ConversionRow[] = [
  { from: 0, letter: 'F', gpa4: 0, rank: 'Kém' },
  { from: 4, letter: 'D', gpa4: 1, rank: 'Trung bình yếu' },
  { from: 5, letter: 'D+', gpa4: 1.5, rank: 'Trung bình yếu' },
  { from: 5.5, letter: 'C', gpa4: 2, rank: 'Trung bình' },
  { from: 6.5, letter: 'C+', gpa4: 2.5, rank: 'Trung bình' },
  { from: 7, letter: 'B', gpa4: 3, rank: 'Khá' },
  { from: 8, letter: 'B+', gpa4: 3.5, rank: 'Khá' },
  { from: 8.5, letter: 'A', gpa4: 3.7, rank: 'Giỏi' },
  { from: 9, letter: 'A+', gpa4: 4, rank: 'Giỏi' },
];

export const DEFAULT_COMPONENT_LIBRARY = ['Chuyên cần', 'Kiểm tra', 'Thực hành', 'Bài tập lớn', 'Giữa kỳ', 'Cuối kỳ'];

export function defaultSettings(): Settings {
  return {
    scaleMax: 10,
    courseDecimals: 1,
    gpaDecimals: 2,
    passScore: 4,
    failCountsInGpa: true,
    bonusDefault: false,
    passOnlyScore: 5,
    passSymbol: 'P',
    failSymbol: 'F',
    termCount: 8,
    termsPerYear: 2,
    yearLabel: 'Năm',
    termNames: ['HK1', 'HK2', 'HK3', 'HK4'],
    conversion: DEFAULT_CONVERSION.map((r) => ({ ...r })),
    student: { name: '', id: '', school: '', major: '' },
  };
}

export function defaultData(): AppData {
  return { version: 1, settings: defaultSettings(), componentLibrary: [...DEFAULT_COMPONENT_LIBRARY], courses: [] };
}

export function makeComponent(name: string, weight: number | null, enabled = true, joinPrev = false): CourseComponent {
  return { id: newId('cmp'), name, enabled, weight, joinPrev, score: null };
}

export interface Preset {
  id: string;
  label: string;
  build: (library: string[]) => CourseComponent[];
}

const pick = (lib: string[], i: number, fallback: string) => lib[i] ?? fallback;

export const PRESETS: Preset[] = [
  {
    id: 'qt30',
    label: 'Quá trình 30% + cuối kỳ 70%',
    build: (lib) => [
      makeComponent(pick(lib, 0, 'Chuyên cần'), 0.3),
      makeComponent(pick(lib, 1, 'Kiểm tra'), null, true, true),
      makeComponent(pick(lib, 2, 'Thực hành'), null, true, true),
      makeComponent(pick(lib, 5, 'Cuối kỳ'), 0.7),
    ],
  },
  {
    id: 'cc10-gk20-ck70',
    label: 'Chuyên cần 10% + giữa kỳ 20% + cuối kỳ 70%',
    build: (lib) => [
      makeComponent(pick(lib, 0, 'Chuyên cần'), 0.1),
      makeComponent(pick(lib, 4, 'Giữa kỳ'), 0.2),
      makeComponent(pick(lib, 5, 'Cuối kỳ'), 0.7),
    ],
  },
  {
    id: 'cc10-kt10-gk20-ck60',
    label: 'Chuyên cần 10% + kiểm tra 10% + giữa kỳ 20% + cuối kỳ 60%',
    build: (lib) => [
      makeComponent(pick(lib, 0, 'Chuyên cần'), 0.1),
      makeComponent(pick(lib, 1, 'Kiểm tra'), 0.1),
      makeComponent(pick(lib, 4, 'Giữa kỳ'), 0.2),
      makeComponent(pick(lib, 5, 'Cuối kỳ'), 0.6),
    ],
  },
  {
    id: 'ck100',
    label: 'Chỉ cuối kỳ 100%',
    build: (lib) => [makeComponent(pick(lib, 5, 'Cuối kỳ'), 1)],
  },
];

export function newCourse(term: number, library: string[]): Course {
  return {
    id: newId('crs'),
    code: '',
    name: '',
    credits: 3,
    term,
    instructor: '',
    note: '',
    gpaMode: 'yes',
    bonus: null,
    bonusMode: 'default',
    useProgress: false,
    progress: null,
    components: PRESETS[1].build(library),
    target: { t10: null, t4: null, letter: '' },
  };
}
