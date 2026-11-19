import type { PlayerSettings } from '../../types/player';

/**
 * セーブデータのバージョン。
 * PlayerSave の構造を変更したら値を上げ、migrations.ts に変換処理を追加する。
 */
export const SAVE_VERSION = 1;

export const SAVE_STORAGE_KEY = 'network-memory:save';
export const SAVE_BACKUP_PREFIX = 'network-memory:backup:';

export const PLAYER_NAME_MAX = 12;

export const DEFAULT_SETTINGS: PlayerSettings = {
  fx: 'full',
  skipBoot: false,
  textSpeed: 3,
  bgmVolume: 0.6,
  seVolume: 0.8,
  devMode: false,
};

/** 新規開始時に付与する通貨 */
export const STARTING_WALLET = { DATA: 1000, CREDIT: 300 } as const;

export function normalizePlayerName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, PLAYER_NAME_MAX);
}
