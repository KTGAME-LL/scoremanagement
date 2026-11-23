import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { useConfirm } from './Confirm';
import { NumberField } from './NumberField';
import { fmt } from './format';
import { computeCourse } from '../core/compute';
import { computeHints, effectiveTarget, hintText } from '../core/targets';
import { termLabel } from '../core/stats';
import { PRESETS } from '../core/defaults';
import type { Course, CourseResult, Settings } from '../core/types';

const GPA_MODE_TEXT = { yes: 'Tính vào điểm trung bình', no: 'Không tính vào điểm trung bình', pass: 'Chỉ cần đạt (Đạt / Không đạt)' } as const;
const BONUS_TEXT = { default: 'Theo cấu hình chung', yes: 'Cộng điểm thưởng', no: 'Không cộng điểm thưởng' } as const;
const SEG = ['#0f5c7a', '#3d8fae', '#7ab6cd', '#b3d6e3', '#5a6f80'];

export function CourseView() {
  const st = useStore();
  const confirm = useConfirm();
  const { data, ev, ui } = st;
  const s = data.settings;
  const found = ev.find((e) => e.course.id === ui.courseId) ?? ev[0] ?? null;

  useEffect(() => {
    if (found && ui.courseId !== found.course.id) st.go('course', found.course.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.course.id, ui.courseId]);

  // Chuyển tới ô được chọn từ màn hình Tổng quan.
  useEffect(() => {
    if (!ui.focusId) return;
    const t = window.setTimeout(() => {
      let el = document.getElementById(ui.focusId as string) as HTMLInputElement | null;
      // Thành phần đang bị bỏ qua (tiến trình) không nhập được: chuyển sang ô tiến trình.
      if (el?.disabled) el = document.getElementById('progress') as HTMLInputElement | null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus?.({ preventScroll: true });
    }, 60);
    return () => window.clearTimeout(t);
  }, [ui.focusId, found?.course.id]);

  if (!found) {
    return (
      <section className="empty">
        <h1>Chưa có môn học</h1>
        <p>Thêm môn đầu tiên để bắt đầu nhập điểm.</p>
        <button className="btn primary" onClick={() => st.addCourse(0)}>Thêm môn học</button>
      </section>
    );
  }

  const { course, result } = found;
  const idx = ev.findIndex((e) => e.course.id === course.id);
  const go = (i: number) => st.go('course', ev[(i + ev.length) % ev.length].course.id);

  const terms = [...new Set(ev.map((e) => e.course.term))].sort((a, b) => a - b);

  return (
    <div className="stack course">
      <header className="picker card">
        <label className="grow">
          <span>Môn học</span>
          <select value={course.id} onChange={(e) => st.go('course', e.target.value)}>
            {terms.map((t) => (
              <optgroup key={t} label={termLabel(t, s)}>
                {ev.filter((e) => e.course.term === t).map((e) => (
                  <option key={e.course.id} value={e.course.id}>
                    {(e.course.code ? `${e.course.code} · ` : '') + (e.course.name || '(Chưa đặt tên)')}
                    {e.result.total !== null ? ` · ${fmt(e.result.total, s.courseDecimals)}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="row">
          <button className="btn" onClick={() => go(idx - 1)} disabled={ev.length < 2} aria-label="Môn trước">←</button>
          <button className="btn" onClick={() => go(idx + 1)} disabled={ev.length < 2} aria-label="Môn sau">→</button>
          <button className="btn" onClick={() => st.addCourse(course.term)}>Thêm môn</button>
          <button className="btn" onClick={() => { st.duplicateCourse(course.id); st.notify('Đã nhân bản môn (điểm được xóa trống).'); }}>Nhân bản</button>
          <button
            className="btn danger"
            onClick={async () => {
              if (await confirm(`Xóa môn “${course.name || 'chưa đặt tên'}”?`, 'Xóa môn', true)) {
                st.deleteCourse(course.id);
                st.notify('Đã xóa môn. Bạn có thể Hoàn tác.');
              }
            }}
          >
            Xóa
          </button>
        </div>
      </header>

      <div className="cols">
        <div className="stack">
          <InfoCard course={course} s={s} />
          <ComponentsCard course={course} result={result} s={s} />
          <ProgressCard course={course} result={result} s={s} />
        </div>
        <div className="stack sticky">
          <ResultCard course={course} result={result} s={s} />
          <TargetCard course={course} s={s} />
        </div>
      </div>
    </div>
  );
}

function InfoCard({ course, s }: { course: Course; s: Settings }) {
  const st = useStore();
  const p = (patch: Partial<Course>, key?: string) => st.patchCourse(course.id, patch, key);
  return (
    <section className="card" aria-labelledby="h-info">
      <h2 id="h-info">Thông tin môn</h2>
      <div className="form">
        <label><span>Mã môn</span><input value={course.code} maxLength={30} onChange={(e) => p({ code: e.target.value }, 'code')} /></label>
        <label className="w2"><span>Tên học phần</span><input value={course.name} maxLength={200} onChange={(e) => p({ name: e.target.value }, 'name')} /></label>
        <label><span>Số tín chỉ</span>
          <NumberField label="Số tín chỉ" value={course.credits} min={0} max={50} onChange={(v) => p({ credits: v }, 'credits')} />
        </label>
        <label><span>Học kỳ</span>
          <select value={course.term} onChange={(e) => p({ term: Number(e.target.value) })}>
            {Array.from({ length: s.termCount }, (_, i) => <option key={i} value={i}>{termLabel(i, s)}</option>)}
          </select>
        </label>
        <label><span>Giảng viên</span><input value={course.instructor} maxLength={200} onChange={(e) => p({ instructor: e.target.value }, 'inst')} /></label>
        <label className="w2"><span>Cách tính vào điểm trung bình</span>
          <select value={course.gpaMode} onChange={(e) => p({ gpaMode: e.target.value as Course['gpaMode'] })}>
            {Object.entries(GPA_MODE_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="w3"><span>Ghi chú</span><textarea rows={2} maxLength={1000} value={course.note} onChange={(e) => p({ note: e.target.value }, 'note')} /></label>
      </div>
    </section>
  );
}

function ComponentsCard({ course, result, s }: { course: Course; result: CourseResult; s: Settings }) {
  const st = useStore();
  const { data } = st;
  const [custom, setCustom] = useState('');
  const hints = useMemo(() => computeHints(course, result, s), [course, result, s]);
  const leaderOf = new Map<string, string>();
  const groupOf = new Map<string, (typeof result.groups)[number]>();
  for (const g of result.groups) for (const m of g.memberIds) { leaderOf.set(m, g.id); groupOf.set(m, g); }
  const firstEnabled = course.components.find((c) => c.enabled)?.id;
  const nameOf = (id: string) => course.components.find((c) => c.id === id)?.name ?? '';
  const used = new Set(course.components.map((c) => c.name));
  const addable = data.componentLibrary.filter((n) => !used.has(n));
  const full = course.components.length >= 12;
  const progressActive = course.useProgress && course.progress !== null;

  return (
    <section className="card" aria-labelledby="h-comp">
      <div className="card-head">
        <h2 id="h-comp">Thành phần điểm</h2>
        <label className="inline">
          <span className="sr">Mẫu thành phần</span>
          <select
            value=""
            onChange={(e) => e.target.value && st.applyPreset(course.id, e.target.value)}
            aria-label="Áp dụng mẫu thành phần"
          >
            <option value="">Áp dụng mẫu…</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </div>
      <p className="muted small">
        Tắt công tắc để thành phần không tính cho môn này. Với các cột dùng chung trọng số, chỉ cần nhập ô đầu; ô sau để trống hoặc nhập thêm để lấy trung bình.
      </p>
      <div className="table-wrap">
        <table className="tbl comp">
          <thead>
            <tr><th>Tính</th><th>Thành phần</th><th>Trọng số %</th><th>Gộp với dòng trên</th><th>Điểm</th><th>Ghi chú</th><th /></tr>
          </thead>
          <tbody>
            {course.components.map((c, i) => {
              const g = groupOf.get(c.id);
              const follower = !!g && leaderOf.get(c.id) !== c.id;
              const bad = result.badIds.includes(c.id);
              const unweighted = result.unweightedIds.includes(c.id);
              const isHintHost = hints.finalGroupId === c.id && c.score === null && hints.final !== null;
              let note = '';
              let tone = '';
              if (!c.enabled) note = 'Không tính';
              else if (bad) { note = 'Cần kiểm tra'; tone = 'error'; }
              else if (unweighted) { note = 'Chưa có trọng số'; tone = 'warn'; }
              else if (g?.ignored) note = 'Đã gồm trong tiến trình';
              else if (follower) note = `Cùng nhóm “${nameOf(leaderOf.get(c.id) as string)}”`;
              else if (g?.isFinal) { note = 'Điểm cuối kỳ'; tone = 'final'; }
              else if (!g) note = 'Bỏ qua (0%)';
              const ignored = !!g?.ignored && progressActive;
              return (
                <tr key={c.id} className={`${c.enabled ? '' : 'off'} ${ignored ? 'ignored' : ''}`}>
                  <td>
                    <label className="switch">
                      <input type="checkbox" checked={c.enabled} onChange={(e) => st.patchComponent(course.id, c.id, { enabled: e.target.checked })} aria-label={`Tính “${c.name}”`} />
                      <span />
                    </label>
                  </td>
                  <td>
                    <input className="name" value={c.name} maxLength={60} aria-label="Tên thành phần" onChange={(e) => st.patchComponent(course.id, c.id, { name: e.target.value }, 'name')} />
                  </td>
                  <td>
                    {follower || (c.joinPrev && c.id !== firstEnabled && c.enabled) ? (
                      <span className="muted small">dùng chung</span>
                    ) : (
                      <NumberField
                        label={`Trọng số ${c.name}`}
                        percent
                        min={0}
                        max={1}
                        value={c.weight}
                        placeholder="%"
                        disabled={!c.enabled}
                        invalid={bad && c.weight === null}
                        onChange={(v) => st.patchComponent(course.id, c.id, { weight: v }, 'w')}
                      />
                    )}
                  </td>
                  <td>
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={c.joinPrev}
                        disabled={!c.enabled || c.id === firstEnabled}
                        onChange={(e) => st.patchComponent(course.id, c.id, { joinPrev: e.target.checked })}
                        aria-label={`Gộp “${c.name}” với thành phần phía trên`}
                      />
                    </label>
                  </td>
                  <td>
                    <NumberField
                      id={`cmp-${c.id}`}
                      label={`Điểm ${c.name}`}
                      min={0}
                      max={s.scaleMax}
                      value={c.score}
                      disabled={!c.enabled || ignored}
                      invalid={bad && c.score !== null}
                      hint={isHintHost}
                      placeholder={isHintHost ? hintText(hints.final) : follower ? 'tùy chọn' : '·'}
                      onChange={(v) => st.patchComponent(course.id, c.id, { score: v }, 's')}
                    />
                  </td>
                  <td><span className={`note ${tone}`}>{note}</span></td>
                  <td className="acts">
                    <button className="icon" aria-label="Chuyển lên" disabled={i === 0} onClick={() => st.moveComponent(course.id, c.id, -1)}>↑</button>
                    <button className="icon" aria-label="Chuyển xuống" disabled={i === course.components.length - 1} onClick={() => st.moveComponent(course.id, c.id, 1)}>↓</button>
                    <button className="icon danger" aria-label={`Xóa “${c.name}”`} onClick={() => st.removeComponent(course.id, c.id)}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {course.components.length === 0 && <p className="muted">Chưa có thành phần. Thêm bên dưới hoặc chọn một mẫu.</p>}
      <div className="row wrap add">
        {addable.map((n) => (
          <button key={n} className="chip add" disabled={full} onClick={() => st.addComponent(course.id, n)}>+ {n}</button>
        ))}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (custom.trim() && !full) { st.addComponent(course.id, custom); setCustom(''); }
          }}
        >
          <input value={custom} maxLength={60} placeholder="Thành phần khác…" aria-label="Tên thành phần mới" onChange={(e) => setCustom(e.target.value)} />
          <button className="btn" type="submit" disabled={full || !custom.trim()}>Thêm</button>
        </form>
        {full && <span className="muted small">Tối đa 12 thành phần.</span>}
      </div>
    </section>
  );
}

function ProgressCard({ course, result, s }: { course: Course; result: CourseResult; s: Settings }) {
  const st = useStore();
  const hints = useMemo(() => computeHints(course, result, s), [course, result, s]);
  const p = (patch: Partial<Course>, key?: string) => st.patchCourse(course.id, patch, key);
  const hintOn = hints.progress !== null && course.progress === null;
  return (
    <section className="card" aria-labelledby="h-prog">
      <h2 id="h-prog">Điểm tiến trình và điểm thưởng</h2>
      <div className="form">
        <label className="w3 check-line">
          <input type="checkbox" checked={course.useProgress} onChange={(e) => p({ useProgress: e.target.checked })} />
          <span>
            Dùng điểm tiến trình đã quy đổi: điểm tổng hợp các thành phần trước cuối kỳ (đã nhân trọng số). Khi nhập, các điểm thành phần trước cuối kỳ không còn được tính.
          </span>
        </label>
        <label>
          <span>Điểm tiến trình (đã nhân trọng số)</span>
          <NumberField
            id="progress"
            label="Điểm tiến trình"
            min={0}
            max={s.scaleMax}
            value={course.progress}
            disabled={!course.useProgress}
            hint={hintOn && course.useProgress}
            placeholder={hintOn && course.useProgress ? hintText(hints.progress) : 'vd 2,5'}
            onChange={(v) => p({ progress: v }, 'prog')}
          />
        </label>
        <label>
          <span>Điểm thưởng</span>
          <NumberField label="Điểm thưởng" min={0} max={s.scaleMax} value={course.bonus} placeholder="0" onChange={(v) => p({ bonus: v }, 'bonus')} />
        </label>
        <label>
          <span>Áp dụng điểm thưởng</span>
          <select value={course.bonusMode} onChange={(e) => p({ bonusMode: e.target.value as Course['bonusMode'] })}>
            {Object.entries(BONUS_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
    </section>
  );
}

function ResultCard({ course, result, s }: { course: Course; result: CourseResult; s: Settings }) {
  const [what, setWhat] = useState<number | null>(null);
  const fg = result.finalGroup;
  const leader = fg ? course.components.find((c) => c.id === fg.id) : undefined;
  const sim = useMemo(() => {
    if (what === null || !leader) return null;
    const c: Course = { ...course, components: course.components.map((x) => (x.id === leader.id ? { ...x, score: what } : x)) };
    return computeCourse(c, s);
  }, [what, leader, course, s]);

  const segs: { label: string; value: number }[] = [];
  if (result.mode === 'progress' && course.progress !== null) segs.push({ label: 'Tiến trình', value: course.progress });
  for (const g of result.groups) {
    if (g.ignored || g.score === null) continue;
    const name = course.components.find((c) => c.id === g.id)?.name ?? '';
    segs.push({ label: name, value: g.contribution });
  }
  if (result.bonusApplied > 0) segs.push({ label: 'Điểm thưởng', value: result.bonusApplied });

  const conv = s.conversion;
  const tgt = effectiveTarget(course.target, s);

  return (
    <section className="card result" aria-labelledby="h-res">
      <h2 id="h-res">Kết quả</h2>
      <div className="big" aria-live="polite">
        <strong>{fmt(result.total, s.courseDecimals)}</strong>
        <span>/ {s.scaleMax}</span>
        <em className={`letter ${result.letter ? '' : 'none'}`}>{result.letter || '·'}</em>
      </div>
      <dl className="kv">
        <div><dt>Thang 4</dt><dd>{fmt(result.gpa4, 1)}</dd></div>
        <div><dt>Xếp loại</dt><dd>{result.classification || '·'}</dd></div>
        <div><dt>Tín chỉ đạt</dt><dd>{result.creditsEarned}</dd></div>
        <div><dt>Tổng trọng số</dt><dd>{result.mode === 'progress' ? 'theo tiến trình' : `${fmt(result.weightSum * 100, 0)}%`}</dd></div>
      </dl>
      <p className={`status ${result.status.level}`} role="status">{result.status.message}</p>

      {segs.length > 0 && (
        <div className="contrib">
          <div className="stackbar" role="img" aria-label={segs.map((x) => `${x.label} ${fmt(x.value, 2)}`).join(', ')}>
            {segs.map((x, i) => (
              <span key={i} style={{ width: `${Math.min(100, (x.value / s.scaleMax) * 100)}%`, background: SEG[i % SEG.length] }} />
            ))}
          </div>
          <ul className="legend">
            {segs.map((x, i) => (
              <li key={i}><i style={{ background: SEG[i % SEG.length] }} />{x.label}: <b>{fmt(x.value, 2)}</b></li>
            ))}
          </ul>
        </div>
      )}

      <div className="ruler" aria-hidden="true">
        <div className="bands">
          {conv.map((r, i) => {
            const end = i + 1 < conv.length ? conv[i + 1].from : s.scaleMax;
            return <span key={i} style={{ width: `${((end - r.from) / s.scaleMax) * 100}%` }}>{r.letter}</span>;
          })}
        </div>
        {tgt && <i className="mk target" style={{ left: `${(tgt.t10 / s.scaleMax) * 100}%` }} />}
        {result.total !== null && <i className="mk now" style={{ left: `${(result.total / s.scaleMax) * 100}%` }} />}
      </div>
      {tgt && <p className="muted small">Vạch gạch nét: mục tiêu {fmt(tgt.t10, s.courseDecimals)} ({tgt.letter}).</p>}

      {leader && (
        <div className="whatif">
          <label>
            <span>Thử giả định: nếu “{leader.name}” là</span>
            <NumberField label="Điểm giả định" min={0} max={s.scaleMax} value={what} placeholder="vd 7" onChange={setWhat} />
          </label>
          {sim && <p>→ Tổng kết <b>{fmt(sim.total, s.courseDecimals)}</b> ({sim.letter || '·'}){sim.status.level === 'error' ? ` · ${sim.status.message}` : ''}</p>}
        </div>
      )}
    </section>
  );
}

function TargetCard({ course, s }: { course: Course; s: Settings }) {
  const st = useStore();
  const tgt = effectiveTarget(course.target, s);
  const set = (patch: Partial<Course['target']>, key: string) => st.patchCourse(course.id, { target: { ...course.target, ...patch } }, key);
  const letters = s.conversion.map((r) => r.letter);
  return (
    <section className="card" aria-labelledby="h-tgt">
      <h2 id="h-tgt">Mục tiêu điểm</h2>
      <p className="muted small">Nhập một trong ba ô. Ô điểm cần đạt sẽ hiện chữ đỏ đậm trong bảng thành phần và ô tiến trình.</p>
      <div className="form two">
        <label><span>Thang {s.scaleMax}</span><NumberField label="Mục tiêu thang 10" min={0} max={s.scaleMax} value={course.target.t10} onChange={(v) => set({ t10: v }, 't10')} /></label>
        <label><span>Thang 4</span><NumberField label="Mục tiêu thang 4" min={0} max={4} value={course.target.t4} onChange={(v) => set({ t4: v }, 't4')} /></label>
        <label className="w2"><span>Điểm chữ</span>
          <select value={course.target.letter} onChange={(e) => set({ letter: e.target.value }, 'letter')}>
            <option value="">Chưa chọn</option>
            {letters.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
      </div>
      {tgt ? (
        <p className="small">Mục tiêu quy đổi: <b>{tgt.letter}</b> · thang 4: <b>{fmt(tgt.gpa4, 1)}</b> · thang {s.scaleMax}: <b>{fmt(tgt.t10, s.courseDecimals)}</b>{tgt.multi ? ' (lấy mức cao nhất trong các ô đã nhập)' : ''}</p>
      ) : (
        <p className="muted small">Chưa đặt mục tiêu.</p>
      )}
    </section>
  );
}
