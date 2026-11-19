import type { GameData } from '../data/gameData';
import { migrateSave } from './migrations';
import { sanitizeSave } from './sanitize';
import { SAVE_BACKUP_PREFIX, SAVE_STORAGE_KEY } from './schema';
import type { PlayerSave } from '../../types/player';

/**
 * セーブデータの永続化。
 *
 * KeyValueStore を差し替えることで保存先を変更できる。
 * PHASE 1: localStorage（使用不可の環境ではメモリ上のみ）
 * PHASE 5: ローカル保存 + Supabase 同期（サーバー側検証つき）を追加予定
 */

export interface KeyValueStore {
  readonly kind: 'local' | 'memory';
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    kind: 'memory',
    get: (k) => map.get(k) ?? null,
    set: (k, v) => void map.set(k, v),
    remove: (k) => void map.delete(k),
  };
}

/** localStorage が使えるか実際に書き込んで確認し、使えなければメモリストアを返す */
export function createBrowserStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage;
    const probe = '__network_probe__';
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return {
      kind: 'local',
      get: (k) => ls.getItem(k),
      set: (k, v) => ls.setItem(k, v),
      remove: (k) => ls.removeItem(k),
    };
  } catch {
    return createMemoryStore();
  }
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; save: PlayerSave; issues: string[] }
  | { status: 'corrupted'; error: string; backupKey: string | null };

/** 文字列（保存データ/インポートファイル）を検証済みセーブデータに変換する */
export function parseSaveText(text: string, data: GameData): { ok: true; save: PlayerSave; issues: string[] } | { ok: false; error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'JSONとして読み取れません' };
  }
  const migrated = migrateSave(raw);
  if (!migrated.ok) return migrated;
  const result = sanitizeSave(migrated.data, data);
  if (!result.ok) return result;
  const issues = migrated.from < result.save.version ? [`セーブデータを v${migrated.from} から更新しました`, ...result.issues] : result.issues;
  return { ok: true, save: result.save, issues };
}

export class SaveManager {
  constructor(
    private readonly store: KeyValueStore,
    private readonly data: GameData,
    private readonly key: string = SAVE_STORAGE_KEY,
  ) {}

  get storageKind(): KeyValueStore['kind'] {
    return this.store.kind;
  }

  load(): LoadResult {
    let text: string | null;
    try {
      text = this.store.get(this.key);
    } catch {
      return { status: 'corrupted', error: 'ストレージを読み取れません', backupKey: null };
    }
    if (text === null) return { status: 'empty' };
    const parsed = parseSaveText(text, this.data);
    if (parsed.ok) return { status: 'loaded', save: parsed.save, issues: parsed.issues };
    // 読めないデータは消さずにバックアップへ退避する
    const backupKey = `${SAVE_BACKUP_PREFIX}${Date.now()}`;
    try {
      this.store.set(backupKey, text);
      this.store.remove(this.key);
      return { status: 'corrupted', error: parsed.error, backupKey };
    } catch {
      return { status: 'corrupted', error: parsed.error, backupKey: null };
    }
  }

  /** 保存に成功したら保存時刻を返す */
  save(save: PlayerSave): { ok: true; at: string } | { ok: false; error: string } {
    const at = new Date().toISOString();
    try {
      this.store.set(this.key, JSON.stringify({ ...save, updatedAt: at }));
      return { ok: true, at };
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      return { ok: false, error: quota ? 'ストレージの空き容量が不足しています' : '保存に失敗しました' };
    }
  }

  clear(): void {
    try {
      this.store.remove(this.key);
    } catch {
      /* noop */
    }
  }
}

export function exportSaveText(save: PlayerSave): string {
  return JSON.stringify(save, null, 2);
}

export function exportFileName(save: PlayerSave, at = new Date()): string {
  const stamp = at.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  return `network-memory_${save.profile.playerId}_${stamp}.json`;
}
