import { useCallback, useState } from 'react';

/**
 * 画面遷移をまたいで保持したい UI 状態（検索条件など）。
 * セッション中のみ保持し、セーブデータには含めない。
 */
const memo = new Map<string, unknown>();

function read<T>(key: string, initial: T): T {
  if (memo.has(key)) return memo.get(key) as T;
  try {
    const s = globalThis.sessionStorage?.getItem(`network-memory:ui:${key}`);
    if (s) {
      const parsed: unknown = JSON.parse(s);
      const isPlainObject = (v: unknown) => typeof v === 'object' && v !== null && !Array.isArray(v);
      return (isPlainObject(initial) && isPlainObject(parsed) ? { ...initial, ...(parsed as object) } : parsed) as T;
    }
  } catch {
    /* sessionStorage が使えない環境では無視 */
  }
  return initial;
}

export function useSessionState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        memo.set(key, v);
        try {
          globalThis.sessionStorage?.setItem(`network-memory:ui:${key}`, JSON.stringify(v));
        } catch {
          /* noop */
        }
        return v;
      });
    },
    [key],
  );
  return [value, update];
}

/** 他のコンポーネントから現在値を参照する（Memory 詳細の前後移動など） */
export function peekSessionState<T>(key: string, initial: T): T {
  return read(key, initial);
}
