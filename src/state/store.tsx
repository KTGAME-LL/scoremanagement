import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Course, CourseComponent, ProgramCourse, Settings } from '../core/types';
import { defaultData, makeComponent, newCourse, PRESETS } from '../core/defaults';
import { evaluateAll, type Evaluated } from '../core/stats';
import { LocalStorageAdapter, type StorageAdapter } from '../core/storage';
import { newId } from '../core/id';

export type View = 'overview' | 'course' | 'targets' | 'program' | 'help' | 'settings';
export type Theme = 'auto' | 'light' | 'dark';
export type SaveState = 'saving' | 'saved' | 'error';

interface Ui {
  view: View;
  courseId: string | null;
  focusId: string | null;
  theme: Theme;
}

interface History {
  data: AppData;
  past: AppData[];
  future: AppData[];
  key: string | null;
  at: number;
}

export interface Store {
  data: AppData;
  ev: Evaluated[];
  ui: Ui;
  ready: boolean;
  fresh: boolean;
  warnings: string[];
  saveState: SaveState;
  canUndo: boolean;
  canRedo: boolean;
  toast: string | null;
  flushNow: () => Promise<void>;
  notify: (msg: string) => void;
  go: (view: View, courseId?: string | null, focusId?: string | null) => void;
  setTheme: (t: Theme) => void;
  undo: () => void;
  redo: () => void;
  replaceAll: (d: AppData) => void;
  resetAll: () => Promise<void>;
  addCourse: (term?: number) => string;
  duplicateCourse: (id: string) => string;
  deleteCourse: (id: string) => void;
  patchCourse: (id: string, patch: Partial<Course>, key?: string) => void;
  patchComponent: (courseId: string, compId: string, patch: Partial<CourseComponent>, key?: string) => void;
  addComponent: (courseId: string, name: string) => void;
  removeComponent: (courseId: string, compId: string) => void;
  moveComponent: (courseId: string, compId: string, dir: -1 | 1) => void;
  applyPreset: (courseId: string, presetId: string) => void;
  patchSettings: (patch: Partial<Settings>, key?: string) => void;
  setLibrary: (lib: string[]) => void;
  addProgram: (term: number) => void;
  patchProgram: (id: string, patch: Partial<ProgramCourse>, key?: string) => void;
  deleteProgram: (id: string) => void;
  addProgramToTranscript: (ids: string[]) => number;
}

const Ctx = createContext<Store | null>(null);
export const useStore = (): Store => {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore cần nằm trong StoreProvider');
  return s;
};

const UI_KEY = 'diem-app:ui';
function loadUi(): Ui {
  const d: Ui = { view: 'overview', courseId: null, focusId: null, theme: 'auto' };
  try {
    const r = JSON.parse(localStorage.getItem(UI_KEY) || '{}');
    if (['overview', 'course', 'targets', 'program', 'help', 'settings'].includes(r.view)) d.view = r.view;
    if (typeof r.courseId === 'string') d.courseId = r.courseId.slice(0, 60);
    if (['auto', 'light', 'dark'].includes(r.theme)) d.theme = r.theme;
  } catch {
    /* dùng mặc định */
  }
  return d;
}

const HISTORY_MAX = 60;
const COALESCE_MS = 900;

export function StoreProvider({ children, adapter }: { children: ReactNode; adapter?: StorageAdapter }) {
  const store = useRef<StorageAdapter>(adapter ?? new LocalStorageAdapter());
  const [h, setH] = useState<History>({ data: defaultData(), past: [], future: [], key: null, at: 0 });
  const [ready, setReady] = useState(false);
  const [fresh, setFresh] = useState(true);
  const dataRef = useRef(h.data);
  dataRef.current = h.data;
  const [warnings, setWarnings] = useState<string[]>([]);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [ui, setUi] = useState<Ui>(loadUi);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const loaded = useRef(false);
  const justLoaded = useRef(false);
  const dirty = useRef(false);
  const latest = useRef<AppData>(h.data);

  useEffect(() => {
    let alive = true;
    store.current.load().then((r) => {
      if (!alive) return;
      setH({ data: r.data, past: [], future: [], key: null, at: 0 });
      setFresh(r.fresh);
      setWarnings(r.warnings);
      loaded.current = true;
      justLoaded.current = true;
      latest.current = r.data;
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Tự lưu liên tục: ghi vào máy ngay sau khi ngừng sửa 300ms, và ghi gấp khi đóng/ẩn tab.
  const flush = useCallback((): Promise<void> => {
    if (!dirty.current) return Promise.resolve();
    dirty.current = false;
    return store.current
      .save(latest.current)
      .then(() => setSaveState('saved'))
      .catch(() => {
        dirty.current = true;
        setSaveState('error');
      });
  }, []);

  useEffect(() => {
    latest.current = h.data;
    if (!loaded.current) return;
    if (justLoaded.current) {
      justLoaded.current = false;
      return;
    }
    dirty.current = true;
    setSaveState('saving');
    const t = window.setTimeout(() => {
      void flush();
    }, 300);
    return () => window.clearTimeout(t);
  }, [h.data, flush]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onLeave = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onLeave);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [flush]);

  useEffect(() => {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({ view: ui.view, courseId: ui.courseId, theme: ui.theme }));
    } catch {
      /* không quan trọng */
    }
    const root = document.documentElement;
    if (ui.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', ui.theme);
  }, [ui.view, ui.courseId, ui.theme]);

  const commit = useCallback((fn: (d: AppData) => AppData, key: string | null = null) => {
    setH((cur) => {
      const next = fn(cur.data);
      if (next === cur.data) return cur;
      const now = Date.now();
      const coalesce = key !== null && key === cur.key && now - cur.at < COALESCE_MS;
      const past = coalesce ? cur.past : [...cur.past, cur.data].slice(-HISTORY_MAX);
      return { data: next, past, future: [], key, at: now };
    });
  }, []);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const mapCourse = (id: string, fn: (c: Course) => Course) => (d: AppData): AppData => ({
    ...d,
    courses: d.courses.map((c) => (c.id === id ? fn(c) : c)),
  });

  const api = useMemo<Omit<Store, 'data' | 'ev' | 'ui' | 'ready' | 'fresh' | 'warnings' | 'saveState' | 'canUndo' | 'canRedo' | 'toast' | 'flushNow'>>(
    () => ({
      notify,
      go: (view, courseId, focusId) =>
        setUi((u) => ({ ...u, view, courseId: courseId === undefined ? u.courseId : courseId, focusId: focusId ?? null })),
      setTheme: (theme) => setUi((u) => ({ ...u, theme })),
      undo: () =>
        setH((c) => (c.past.length ? { data: c.past[c.past.length - 1], past: c.past.slice(0, -1), future: [c.data, ...c.future], key: null, at: 0 } : c)),
      redo: () =>
        setH((c) => (c.future.length ? { data: c.future[0], past: [...c.past, c.data], future: c.future.slice(1), key: null, at: 0 } : c)),
      replaceAll: (d) => {
        commit(() => d);
        setUi((u) => ({ ...u, courseId: d.courses[0]?.id ?? null, focusId: null }));
        setFresh(false);
      },
      resetAll: async () => {
        await store.current.clear();
        setH({ data: defaultData(), past: [], future: [], key: null, at: 0 });
        setUi((u) => ({ ...u, view: 'overview', courseId: null, focusId: null }));
        setFresh(true);
      },
      addCourse: (term = 0) => {
        let id = '';
        commit((d) => {
          const c = newCourse(Math.min(term, d.settings.termCount - 1), d.componentLibrary);
          id = c.id;
          return { ...d, courses: [...d.courses, c] };
        });
        setUi((u) => ({ ...u, view: 'course', courseId: id, focusId: null }));
        setFresh(false);
        return id;
      },
      duplicateCourse: (id) => {
        const nid = newId('crs');
        commit((d) => {
          const src = d.courses.find((c) => c.id === id);
          if (!src) return d;
          const copy: Course = {
            ...src,
            id: nid,
            name: `${src.name} (bản sao)`.slice(0, 200),
            components: src.components.map((c) => ({ ...c, id: newId('cmp'), score: null })),
            progress: null,
          };
          return { ...d, courses: [...d.courses, copy] };
        });
        setUi((u) => ({ ...u, view: 'course', courseId: nid, focusId: null }));
        return nid;
      },
      deleteCourse: (id) => {
        commit((d) => ({ ...d, courses: d.courses.filter((c) => c.id !== id) }));
        setUi((u) => (u.courseId === id ? { ...u, courseId: null, view: 'overview' } : u));
      },
      patchCourse: (id, patch, key) => commit(mapCourse(id, (c) => ({ ...c, ...patch })), key ? `c:${id}:${key}` : null),
      patchComponent: (cid, compId, patch, key) =>
        commit(
          mapCourse(cid, (c) => ({ ...c, components: c.components.map((x) => (x.id === compId ? { ...x, ...patch } : x)) })),
          key ? `k:${compId}:${key}` : null,
        ),
      addComponent: (cid, name) =>
        commit(
          mapCourse(cid, (c) => (c.components.length >= 12 ? c : { ...c, components: [...c.components, makeComponent(name.trim().slice(0, 60) || 'Thành phần', null)] })),
        ),
      removeComponent: (cid, compId) =>
        commit(mapCourse(cid, (c) => ({ ...c, components: c.components.filter((x) => x.id !== compId) }))),
      moveComponent: (cid, compId, dir) =>
        commit(
          mapCourse(cid, (c) => {
            const i = c.components.findIndex((x) => x.id === compId);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= c.components.length) return c;
            const arr = [...c.components];
            [arr[i], arr[j]] = [arr[j], arr[i]];
            return { ...c, components: arr };
          }),
        ),
      applyPreset: (cid, presetId) => {
        const p = PRESETS.find((x) => x.id === presetId);
        if (!p) return;
        commit((d) => mapCourse(cid, (c) => ({ ...c, components: p.build(d.componentLibrary), useProgress: false, progress: null }))(d));
      },
      patchSettings: (patch, key) => commit((d) => ({ ...d, settings: { ...d.settings, ...patch } }), key ? `s:${key}` : null),
      setLibrary: (lib) => commit((d) => ({ ...d, componentLibrary: lib })),
      addProgram: (term) =>
        commit((d) =>
          d.program.length >= 300
            ? d
            : { ...d, program: [...d.program, { id: newId('prg'), term, code: '', name: '', credits: null, instructor: '', test: '', midterm: '', final: '', note: '' }] },
        ),
      patchProgram: (id, patch, key) =>
        commit((d) => ({ ...d, program: d.program.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), key ? `p:${id}:${key}` : null),
      deleteProgram: (id) => commit((d) => ({ ...d, program: d.program.filter((p) => p.id !== id) })),
      addProgramToTranscript: (ids) => {
        const d0 = dataRef.current;
        const keyOf = (code: string, name: string, term: number) => (code ? `c:${code.toLowerCase()}` : `n:${name.toLowerCase()}:${term}`);
        const have = new Set(d0.courses.map((c) => keyOf(c.code, c.name, c.term)));
        const picked: ProgramCourse[] = [];
        for (const p of d0.program) {
          if (!ids.includes(p.id) || (!p.name && !p.code)) continue;
          const k = keyOf(p.code, p.name, p.term);
          if (have.has(k) || d0.courses.length + picked.length >= 500) continue;
          have.add(k);
          picked.push(p);
        }
        if (picked.length) {
          commit((d) => ({
            ...d,
            courses: [
              ...d.courses,
              ...picked.map((p) => ({ ...newCourse(p.term, d.componentLibrary), code: p.code, name: p.name, credits: p.credits, instructor: p.instructor, note: p.note })),
            ].slice(0, 500),
          }));
        }
        notify(picked.length ? `Đã thêm ${picked.length} môn vào bảng điểm` : 'Các môn này đã có trong bảng điểm');
        return picked.length;
      },
    }),
    [commit, notify],
  );

  const ev = useMemo(() => evaluateAll(h.data), [h.data]);
  const flushNow = flush;
  const value: Store = {
    ...api,
    data: h.data,
    ev,
    ui,
    ready,
    fresh,
    warnings,
    saveState,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    toast,
    flushNow,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
