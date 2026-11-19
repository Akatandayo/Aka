import { SAVE_VERSION } from './schema';

/**
 * セーブデータのマイグレーション。
 *
 * MIGRATIONS[n] は「バージョン n のデータ」を「バージョン n+1」に変換する。
 * 例（将来 v2 を追加する場合）:
 *   1: (raw) => ({ ...raw, version: 2, newField: defaultValue }),
 */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Record<number, Migration> = {};

export type MigrateResult = { ok: true; data: Record<string, unknown>; from: number } | { ok: false; error: string };

export function migrateSave(raw: unknown): MigrateResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, error: 'セーブデータの形式が不正です' };
  }
  let data = raw as Record<string, unknown>;
  const from = typeof data.version === 'number' ? data.version : NaN;
  if (!Number.isInteger(from) || from < 1) return { ok: false, error: 'セーブデータのバージョンが不明です' };
  if (from > SAVE_VERSION) {
    return { ok: false, error: `新しいバージョン（v${from}）のセーブデータです。ゲームを更新してください` };
  }
  for (let v = from; v < SAVE_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) return { ok: false, error: `v${v} からのマイグレーションが定義されていません` };
    data = m(data);
  }
  return { ok: true, data, from };
}
