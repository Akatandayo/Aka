/**
 * ID 生成。
 * crypto.randomUUID は安全なコンテキスト（https/localhost）でしか使えないため、
 * LAN 経由（http://192.168.x.x）でスマホから開いた場合のフォールバックを用意する。
 */
export function createId(prefix = ''): string {
  const c = globalThis.crypto;
  let uuid: string;
  if (c && typeof c.randomUUID === 'function') {
    uuid = c.randomUUID();
  } else {
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') {
      c.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/** 探索者 ID（表示用の短い ID）: 例 "EX-7F3A-91C2" */
export function createExplorerCode(): string {
  const hex = createId().replace(/-/g, '').toUpperCase();
  return `EX-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}
