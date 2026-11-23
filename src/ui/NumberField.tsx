import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  /** Hiển thị và nhập theo phần trăm; lưu dạng phân số. */
  percent?: boolean;
  placeholder?: string;
  hint?: boolean;
  label: string;
  className?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
const fmt = (v: number | null, percent?: boolean) => (v === null ? '' : String(round4(percent ? v * 100 : v)).replace('.', ','));

function parse(text: string, percent: boolean | undefined, min: number, max: number): { ok: boolean; v: number | null } {
  const t = text.trim().replace('%', '').replace(',', '.');
  if (t === '') return { ok: true, v: null };
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return { ok: false, v: null };
  let n = Number(t);
  if (percent) n /= 100;
  if (!Number.isFinite(n) || n < min - 1e-12 || n > max + 1e-12) return { ok: false, v: null };
  return { ok: true, v: n };
}

/** Ô nhập số: chấp nhận dấu phẩy, giữ chữ đang gõ, chỉ ghi giá trị hợp lệ. */
export function NumberField({ value, onChange, min = 0, max = 1000, percent, placeholder, hint, label, className = '', disabled, invalid, id }: Props) {
  const [draft, setDraft] = useState(fmt(value, percent));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setDraft(fmt(value, percent));
      setBad(false);
    }
  }, [value, percent]);

  return (
    <input
      id={id}
      className={`num ${hint ? 'has-hint' : ''} ${bad || invalid ? 'bad' : ''} ${className}`}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      aria-label={label}
      aria-invalid={bad || invalid || undefined}
      disabled={disabled}
      placeholder={placeholder}
      value={draft}
      onFocus={() => (focused.current = true)}
      onChange={(e) => {
        const t = e.target.value.slice(0, 12);
        setDraft(t);
        const p = parse(t, percent, min, max);
        setBad(!p.ok);
        if (p.ok) onChange(p.v);
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(fmt(value, percent));
        setBad(false);
      }}
    />
  );
}
