import type { AppData } from './types';
import { evaluateAll, termLabel } from './stats';

/** Chặn chèn công thức khi mở CSV bằng Excel: ô bắt đầu bằng = + - @ được thêm dấu nháy. */
export function csvCell(v: string | number | null): string {
  let s = v === null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(data: AppData): string {
  const head = ['Học kỳ', 'Mã môn', 'Tên học phần', 'Tín chỉ', 'Điểm tổng kết', 'Điểm chữ', 'Thang 4', 'Xếp loại', 'Trạng thái'];
  const rows = evaluateAll(data).map(({ course, result }) => [
    termLabel(course.term, data.settings),
    course.code,
    course.name,
    course.credits,
    result.total,
    result.letter,
    result.gpa4,
    result.classification,
    result.status.message,
  ]);
  return '﻿' + [head, ...rows].map((r) => r.map((c) => csvCell(c as string | number | null)).join(',')).join('\r\n');
}

