/**
 * 決定的な乱数（mulberry32）。状態は 32bit 整数 1 つで、BattleState に保存される。
 * 同じシードと同じコマンド列からは、必ず同じ戦闘結果になる。
 */
export function nextRandom(state: number): [value: number, next: number] {
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

export function createSeed(): number {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    c.getRandomValues(buf);
    return buf[0] | 0;
  }
  return Math.floor(Math.random() * 0xffffffff) | 0;
}
