/** Sinh id ngẫu nhiên; ưu tiên Web Crypto, không phụ thuộc thư viện ngoài. */
export function newId(prefix = 'id'): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return `${prefix}_${c.randomUUID().slice(0, 12)}`;
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(2);
    c.getRandomValues(a);
    return `${prefix}_${a[0].toString(36)}${a[1].toString(36)}`;
  }
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
