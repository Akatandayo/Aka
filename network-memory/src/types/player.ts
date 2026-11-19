/**
 * プレイヤーデータ（セーブデータ）の型定義。
 *
 * ローカル保存（localStorage）を一次ストレージとし、
 * PHASE 5 で Supabase（PlayerProfiles / PlayerMemories / PlayerLoadouts / Inventory / Transactions / BattleRecords）と同期する。
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
  'DUPLICATE_MEMORY',
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

/** 主人公の外見（将来の外見カスタマイズ用。現在はプリセットとカラーのみ） */
export interface PlayerAvatar {
  preset: string;
  color: string;
}

/** 主人公（プレイヤー自身が操作する唯一の戦闘キャラクター） */
export interface PlayerProfile {
  playerId: string;
  name: string;
  title: string;
  level: number;
  exp: number;
  avatar: PlayerAvatar;
  bio: string;
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

/** Memory 装備枠の種類 */
export const LOADOUT_SLOT_TYPES = ['main', 'sub', 'passive'] as const;
export type LoadoutSlotType = (typeof LOADOUT_SLOT_TYPES)[number];
export type LoadoutCapacity = Record<LoadoutSlotType, number>;

/** Memory 装備（プリセット）。各配列の要素は PlayerMemory.instanceId（空き枠は null） */
export interface PlayerLoadout {
  id: string;
  name: string;
  slots: Record<LoadoutSlotType, (string | null)[]>;
}

export interface EncounterProgress {
  clears: number;
  bestRounds: number;
  firstClearedAt: string;
}

export type BattleResultKind = 'victory' | 'defeat' | 'retreat';

/** ローカルの戦闘記録（PHASE 5 で BattleRecords と同期・サーバー再計算に使用） */
export interface BattleRecordEntry {
  id: string;
  encounterId: string;
  result: BattleResultKind;
  rounds: number;
  seed: number;
  /** 入力コマンド（シードと合わせて戦闘を再現できる） */
  commands: unknown[];
  at: string;
}

export interface BattleProgress {
  encounters: Record<string, EncounterProgress>;
  wins: number;
  losses: number;
  retreats: number;
  records: BattleRecordEntry[];
}

export type FxLevel = 'full' | 'reduced';

export interface PlayerSettings {
  fx: FxLevel;
  skipBoot: boolean;
  /** ストーリーの文字送り速度（1〜5） */
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
  /** 検出済みで、まだ同期していない Memory（MEMORY SYNC 待ち） */
  pendingSyncIds: string[];
  /** 閲覧済みの ARCHIVE 記録 ID */
  readEntryIds: string[];
}

/** メインストーリーの進行状態（GDD Ver.3 §8） */
export interface StoryProgress {
  completedChapters: string[];
  /** 中断した位置（章 ID と命令の位置）。null なら中断なし */
  current: { chapterId: string; index: number } | null;
  /** 選んだ選択肢（"章ID:選択肢ID" → 選んだ値） */
  choices: Record<string, string>;
}

/** WORLD の修復状態（GDD Ver.3 §5）。回収済み Memory から算出し、回収時に更新して保存する */
export interface WorldProgress {
  restorationRate: number;
  requiredMemories: string[];
  recoveredMemories: string[];
  restoredObjects: string[];
  restoredNPCs: string[];
  unlockedAreas: string[];
  unlockedEvents: string[];
  updatedAt: string;
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
  loadouts: PlayerLoadout[];
  activeLoadoutId: string;
  /** 装備枠の数（将来の拡張に備えてプレイヤーごとに保持） */
  loadoutCapacity: LoadoutCapacity;
  archive: ArchiveState;
  battle: BattleProgress;
  story: StoryProgress;
  /** WORLD ID → 修復状態 */
  worlds: Record<string, WorldProgress>;
  /** アイテム ID → 所持数 */
  inventory: Record<string, number>;
  progress: ProgressState;
  settings: PlayerSettings;
}
