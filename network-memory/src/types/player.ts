/**
 * プレイヤーデータ（セーブデータ）の型定義。
 *
 * ローカル保存（localStorage）を一次ストレージとし、
 * PHASE 5 で Supabase（PlayerProfiles / PlayerMemories / PlayerTeams / Inventory / Transactions）と同期する。
 * 構造を変更するときは SAVE_VERSION を上げ、core/save/migrations.ts にマイグレーションを追加すること。
 */

export const CURRENCIES = ['DATA', 'FRAGMENT', 'CORE', 'CREDIT'] as const;
export type Currency = (typeof CURRENCIES)[number];
export type Wallet = Record<Currency, number>;

export const TRANSACTION_REASONS = [
  'NEW_GAME',
  'DEV_GRANT',
  'MEMORY_LEVEL_UP',
  'SKILL_UPGRADE',
  'LIMIT_BREAK',
  'FUSION',
  'SHOP_PURCHASE',
  'QUEST_REWARD',
  'BATTLE_REWARD',
  'STORY_REWARD',
  'ADJUSTMENT',
] as const;
export type TransactionReason = (typeof TRANSACTION_REASONS)[number];

export interface Transaction {
  id: string;
  /** ISO 8601 */
  at: string;
  currency: Currency;
  /** 増減量（負数で消費） */
  amount: number;
  balanceAfter: number;
  reason: TransactionReason;
  note?: string;
}

export interface PlayerProfile {
  playerId: string;
  name: string;
  title: string;
  level: number;
  exp: number;
  createdAt: string;
  lastLoginAt: string;
}

/** 所持 Memory（インスタンス） */
export interface PlayerMemory {
  instanceId: string;
  memoryId: string;
  level: number;
  exp: number;
  /** 限界突破段階（0〜） */
  limitBreak: number;
  /** スキル ID → スキルレベル */
  skillLevels: Record<string, number>;
  /** 特殊形態 ID（未解放なら null） */
  form: string | null;
  favorite: boolean;
  acquiredAt: string;
  /** 入手経路（表示用ラベル） */
  acquiredFrom: string;
}

export const TEAM_SIZE = 3;

export interface PlayerTeam {
  id: string;
  name: string;
  /** PlayerMemory.instanceId（空き枠は null）。長さは常に TEAM_SIZE */
  slots: (string | null)[];
}

export type FxLevel = 'full' | 'reduced';

export interface PlayerSettings {
  fx: FxLevel;
  skipBoot: boolean;
  /** PHASE 3 で使用（現在は保存のみ） */
  textSpeed: number;
  bgmVolume: number;
  seVolume: number;
  devMode: boolean;
}

export interface ArchiveState {
  /** 存在を発見した Memory（所持していなくてもよい） */
  discoveredMemoryIds: string[];
  /** 閲覧済みの記録断片 ID */
  readFragmentIds: string[];
}

export interface ProgressState {
  /** ストーリー/イベント条件判定用の汎用フラグ */
  flags: Record<string, boolean | number | string>;
}

export interface PlayerSave {
  version: number;
  saveId: string;
  createdAt: string;
  updatedAt: string;
  profile: PlayerProfile;
  wallet: Wallet;
  transactions: Transaction[];
  memories: PlayerMemory[];
  teams: PlayerTeam[];
  activeTeamId: string;
  archive: ArchiveState;
  /** アイテム ID → 所持数 */
  inventory: Record<string, number>;
  progress: ProgressState;
  settings: PlayerSettings;
}
