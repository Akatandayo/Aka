import { DEFAULT_LOADOUT_CAPACITY } from '../constants';
import type { LoadoutCapacity, PlayerSettings } from '../../types/player';

/**
 * セーブデータのバージョン。
 * PlayerSave の構造を変更したら値を上げ、migrations.ts に変換処理を追加する。
 */
export const SAVE_VERSION = 2;

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

/** 新規開始時（および v1 → v2 移行時）に付与するアイテム */
export const STARTING_ITEMS: Record<string, number> = { 'ITEM-0001': 3, 'ITEM-0002': 1, 'ITEM-0004': 1 };

export const DEFAULT_AVATAR = { preset: 'explorer-01', color: '#3ee8ff' } as const;
export const PLAYER_BIO_MAX = 80;

export function normalizePlayerName(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, PLAYER_NAME_MAX);
}

export const DEFAULT_LOADOUT_CAPACITY_SAVE: LoadoutCapacity = DEFAULT_LOADOUT_CAPACITY;
