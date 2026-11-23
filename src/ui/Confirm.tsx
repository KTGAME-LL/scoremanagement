import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Choice } from '../core/cloudSync';

interface Ask {
  message: string;
  okLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}
interface ChooseAsk {
  title: string;
  message: string;
  labels: { remote: string; local: string; cancel: string };
  resolve: (v: Choice) => void;
}
type ConfirmFn = (message: string, okLabel?: string, danger?: boolean) => Promise<boolean>;
type ChooseFn = (title: string, message: string, labels: ChooseAsk['labels']) => Promise<Choice>;
const Ctx = createContext<{ confirm: ConfirmFn; choose: ChooseFn }>({ confirm: () => Promise.resolve(false), choose: () => Promise.resolve('cancel') });
export const useConfirm = () => useContext(Ctx).confirm;
export const useChoose = () => useContext(Ctx).choose;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const [pick, setPick] = useState<ChooseAsk | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (message, okLabel = 'Đồng ý', danger = false) =>
      new Promise((resolve) => {
        prev.current = document.activeElement as HTMLElement | null;
        setAsk({ message, okLabel, danger, resolve });
      }),
    [],
  );
  const choose = useCallback<ChooseFn>(
    (title, message, labels) =>
      new Promise((resolve) => {
        prev.current = document.activeElement as HTMLElement | null;
        setPick({ title, message, labels, resolve });
      }),
    [],
  );

  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
    prev.current?.focus?.();
  };
  const closePick = (v: Choice) => {
    pick?.resolve(v);
    setPick(null);
    prev.current?.focus?.();
  };

  useEffect(() => {
    if (!ask && !pick) return;
    (ask ? okRef : firstRef).current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ask) close(false);
      else closePick('cancel');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask, pick]);

  const value = useMemo(() => ({ confirm, choose }), [confirm, choose]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {ask && (
        <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Xác nhận">
            <p>{ask.message}</p>
            <div className="row end">
              <button className="btn" onClick={() => close(false)}>Hủy</button>
              <button ref={okRef} className={`btn ${ask.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>
                {ask.okLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {pick && (
        <div className="scrim">
          <div className="dialog wide" role="alertdialog" aria-modal="true" aria-label={pick.title}>
            <h2>{pick.title}</h2>
            <p>{pick.message}</p>
            <div className="col">
              <button ref={firstRef} className="btn primary" onClick={() => closePick('remote')}>{pick.labels.remote}</button>
              <button className="btn" onClick={() => closePick('local')}>{pick.labels.local}</button>
              <button className="btn" onClick={() => closePick('cancel')}>{pick.labels.cancel}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
