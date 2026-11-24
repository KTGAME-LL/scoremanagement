import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

interface Ask {
  message: string;
  okLabel: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}
type ConfirmFn = (message: string, okLabel?: string, danger?: boolean) => Promise<boolean>;
const Ctx = createContext<{ confirm: ConfirmFn }>({ confirm: () => Promise.resolve(false) });
export const useConfirm = () => useContext(Ctx).confirm;

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [ask, setAsk] = useState<Ask | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);
  const prev = useRef<HTMLElement | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (message, okLabel = 'Đồng ý', danger = false) =>
      new Promise((resolve) => {
        prev.current = document.activeElement as HTMLElement | null;
        setAsk({ message, okLabel, danger, resolve });
      }),
    [],
  );
  const close = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
    prev.current?.focus?.();
  };
  useEffect(() => {
    if (!ask) return;
    okRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ask]);

  const value = useMemo(() => ({ confirm }), [confirm]);

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
    </Ctx.Provider>
  );
}
