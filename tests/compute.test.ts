import test from 'node:test';
import assert from 'node:assert/strict';
import { computeCourse } from '../src/core/compute';
import { computeHints, effectiveTarget } from '../src/core/targets';
import { defaultSettings, newCourse, makeComponent } from '../src/core/defaults';
import { totals, evaluateAll } from '../src/core/stats';
import { parseImport } from '../src/core/schema';
import { csvCell } from '../src/core/exporters';
import { defaultData } from '../src/core/defaults';
import type { Course } from '../src/core/types';

const S = defaultSettings();
function course(parts: [string, number | null, boolean?][], extra: Partial<Course> = {}): Course {
  const c = newCourse(0, []);
  c.name = 'Môn thử';
  c.components = parts.map(([n, w, join]) => makeComponent(n, w, true, !!join));
  return { ...c, ...extra };
}
const setScore = (c: Course, i: number, v: number | null) => (c.components[i].score = v);

test('gộp chỉ nhập ô đầu: 10%/20%/70% với 9, 7, 9 ra 8,6', () => {
  const c = course([['CC', 0.1], ['KT', null, true], ['GK', 0.2], ['CK', 0.7]]);
  setScore(c, 0, 9); setScore(c, 2, 7); setScore(c, 3, 9);
  const r = computeCourse(c, S);
  assert.equal(r.status.level, 'ok');
  assert.equal(r.total, 8.6);
});

test('nhóm gộp có nhiều điểm thì lấy trung bình', () => {
  const c = course([['CC', 0.3], ['KT', null, true], ['TH', null, true], ['CK', 0.7]]);
  setScore(c, 0, 8); setScore(c, 1, 9); setScore(c, 2, 7); setScore(c, 3, 6);
  assert.equal(computeCourse(c, S).total, 6.6);
});

test('điểm tiến trình 2,5 + 70% x cuối kỳ 7 = 7,4; cuối kỳ 10 = 9,5', () => {
  const c = course([['CC', 0.3], ['CK', 0.7]], { useProgress: true, progress: 2.5 });
  assert.equal(computeCourse(c, S).status.code, 'missing');
  setScore(c, 1, 7);
  assert.equal(computeCourse(c, S).total, 7.4);
  setScore(c, 1, 10);
  assert.equal(computeCourse(c, S).total, 9.5);
});

test('chế độ tiến trình bỏ qua điểm thành phần trước cuối kỳ', () => {
  const c = course([['CC', 0.1], ['GK', 0.2], ['CK', 0.7]], { useProgress: true, progress: 2.5 });
  setScore(c, 0, 10); setScore(c, 1, 10); setScore(c, 2, 7);
  assert.equal(computeCourse(c, S).total, 7.4);
});

test('tổng trọng số khác 100% báo lỗi; thiếu điểm báo cảnh báo', () => {
  const c = course([['CC', 0.2], ['CK', 0.7]]);
  setScore(c, 0, 5);
  assert.equal(computeCourse(c, S).status.code, 'weight-sum');
  const d = course([['CC', 0.3], ['CK', 0.7]]);
  setScore(d, 0, 5);
  assert.equal(computeCourse(d, S).status.code, 'missing');
});

test('điểm ngoài thang và điểm không trọng số bị chặn', () => {
  const c = course([['CC', 0.3], ['CK', 0.7]]);
  setScore(c, 0, 11);
  assert.equal(computeCourse(c, S).status.code, 'range');
  const d = course([['CC', 0.3], ['KT', null], ['CK', 0.7]]);
  setScore(d, 1, 5);
  assert.equal(computeCourse(d, S).status.code, 'unweighted-score');
});

test('0% bỏ thành phần khỏi nhóm; tắt thành phần thì không tính', () => {
  const c = course([['CC', 0.1], ['KT', 0], ['CK', 0.9]]);
  setScore(c, 0, 8); setScore(c, 1, 2); setScore(c, 2, 8);
  assert.equal(computeCourse(c, S).total, 8);
  const d = course([['CC', 0.5], ['KT', 0.5], ['CK', 1]]);
  d.components[1].enabled = false; d.components[0].weight = 0;
  setScore(d, 2, 9);
  assert.equal(computeCourse(d, S).total, 9);
});

test('quy đổi: 8,6 → A (3,7); 8,4 → B+ ; điểm cộng chỉ áp dụng khi bật', () => {
  const c = course([['CK', 1]]);
  setScore(c, 0, 8.6);
  let r = computeCourse(c, S);
  assert.equal(r.letter, 'A'); assert.equal(r.gpa4, 3.7);
  setScore(c, 0, 8.4);
  assert.equal(computeCourse(c, S).letter, 'B+');
  c.bonus = 1;
  assert.equal(computeCourse(c, S).total, 8.4);
  c.bonusMode = 'yes';
  assert.equal(computeCourse(c, S).total, 9.4);
  c.bonus = 5;
  assert.equal(computeCourse(c, S).total, 10);
});

test('mục tiêu: chữ A ra 8,9; thang 4 = 3,5 ra 8,4; nhiều thang lấy cao nhất', () => {
  assert.equal(effectiveTarget({ t10: null, t4: null, letter: 'A' }, S)?.t10, 8.9);
  assert.equal(effectiveTarget({ t10: null, t4: 3.5, letter: '' }, S)?.t10, 8.4);
  const e = effectiveTarget({ t10: 7, t4: null, letter: 'A+' }, S)!;
  assert.equal(e.t10, 10); assert.equal(e.multi, true);
  assert.equal(effectiveTarget({ t10: 8, t4: null, letter: '' }, S)?.letter, 'B+');
});

test('gợi ý đạt mục tiêu khớp bảng Excel', () => {
  // mục tiêu 8,9; tiến trình 2,5; cuối kỳ 70% → (8,9-2,5)/0,7 = 9,15
  let c = course([['CC', 0.3], ['CK', 0.7]], { useProgress: true, progress: 2.5, target: { t10: null, t4: null, letter: 'A' } });
  let h = computeHints(c, computeCourse(c, S), S);
  assert.deepEqual(h.final, { kind: 'exact', value: 9.15 });
  // đã có cuối kỳ 9, mục tiêu 8,4, chưa có tiến trình → 8,4 - 6,3 = 2,1
  c = course([['CC', 0.3], ['CK', 0.7]], { target: { t10: 8.4, t4: null, letter: '' } });
  setScore(c, 1, 9);
  h = computeHints(c, computeCourse(c, S), S);
  assert.deepEqual(h.progress, { kind: 'exact', value: 2.1 });
  // mục tiêu 10, tiến trình 2,5 → cần 10,71 > 10
  c = course([['CC', 0.3], ['CK', 0.7]], { useProgress: true, progress: 2.5, target: { t10: 10, t4: null, letter: '' } });
  assert.equal(computeHints(c, computeCourse(c, S), S).final?.kind, 'impossible');
  // chưa biết gì: mức tối thiểu
  c = course([['CC', 0.3], ['CK', 0.7]], { target: { t10: 8, t4: null, letter: '' } });
  h = computeHints(c, computeCourse(c, S), S);
  assert.deepEqual(h.final, { kind: 'min', value: 7.15 });
  assert.deepEqual(h.progress, { kind: 'min', value: 1 });
  // thành phần đầy đủ trừ cuối kỳ: (8,4 - 0,3*8,5)/0,7 = 8,36
  c = course([['CC', 0.3], ['KT', null, true], ['CK', 0.7]], { target: { t10: 8.4, t4: null, letter: '' } });
  setScore(c, 0, 8); setScore(c, 1, 9);
  assert.deepEqual(computeHints(c, computeCourse(c, S), S).final, { kind: 'exact', value: 8.36 });
  // điểm cộng được trừ vào phần cần đạt: (8-2-1)/0,7 = 7,15
  c = course([['CC', 0.3], ['CK', 0.7]], { useProgress: true, progress: 2, bonus: 1, bonusMode: 'yes', target: { t10: 8, t4: null, letter: '' } });
  assert.deepEqual(computeHints(c, computeCourse(c, S), S).final, { kind: 'exact', value: 7.15 });
});

test('GPA có trọng số tín chỉ; môn P và F theo cấu hình', () => {
  const d = defaultData();
  const a = course([['CK', 1]], { credits: 3 }); setScore(a, 0, 9);
  const b = course([['CK', 1]], { credits: 2 }); setScore(b, 0, 6);
  const p = course([['CK', 1]], { credits: 1, gpaMode: 'pass' }); setScore(p, 0, 9);
  d.courses = [a, b, p];
  const t = totals(evaluateAll(d), d.settings);
  assert.equal(t.gpa10, 7.8);            // (9*3+6*2)/5
  assert.equal(t.gpa4, 3.2);             // 9 → A+ 4,0 ; 6 → C 2,0 : (4*3+2*2)/5
});

test('nhập JSON: loại bỏ rác, ép kiểu, giới hạn', () => {
  const bad = JSON.stringify({ version: 1, settings: { scaleMax: 'x', conversion: [] }, courses: [{ name: '<img src=x onerror=1>', credits: 'abc', components: [{ weight: 5, score: -1 }] }, 7, null] });
  const r = parseImport(bad);
  assert.equal(r.data.settings.scaleMax, 10);
  assert.equal(r.data.courses.length, 1);
  assert.equal(r.data.courses[0].credits, null);
  assert.equal(r.data.courses[0].components[0].weight, null);
  assert.throws(() => parseImport('{not json'));
  assert.throws(() => parseImport(JSON.stringify({ version: 2 })));
});

test('CSV chặn chèn công thức', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('a,b'), '"a,b"');
});
