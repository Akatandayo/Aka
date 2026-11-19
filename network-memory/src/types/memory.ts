import type { Condition } from './condition';

/**
 * Memory マスターデータの型定義。
 *
 * Memory は Network に記録されたあらゆる存在がカード状に具現化したもの。
 * GDD Ver.2: Memory は仲間ではなく、主人公が「同期（MEMORY SYNC）」して自身で使う能力の記録。
 * マスターデータ（不変）とプレイヤー所持データ（PlayerMemory）は分離して管理する。
 * JSON ファイル（src/data/memories/*.json）または将来の DB から読み込まれる。
 */

export const MEMORY_CATEGORIES = [
  'HUMAN',
  'CREATURE',
  'CONCEPT',
  'OBJECT',
  'LOCATION',
  'EVENT',
  'UNKNOWN',
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const RARITIES = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGEND', 'IRREGULAR'] as const;
export type Rarity = (typeof RARITIES)[number];

export const ATTRIBUTES = ['DATA', 'VOID', 'ERROR', 'LIFE', 'CHAOS', 'ORDER'] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

export const STAT_KEYS = ['hp', 'atk', 'def', 'spd', 'tec', 'res'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type StatBlock = Record<StatKey, number>;

export const ACQUISITION_TYPES = [
  'starter',
  'explore',
  'quest',
  'boss',
  'story',
  'event',
  'shop',
  'fusion',
  'unknown',
] as const;
export type AcquisitionType = (typeof ACQUISITION_TYPES)[number];

export interface AcquisitionMethod {
  type: AcquisitionType;
  /** 表示用テキスト */
  label: string;
  worldId?: string;
}

/** メイン装備時の通常攻撃（ATTACK コマンド）のスタイル */
export interface AttackStyle {
  name: string;
  /** 参照ステータス（atk: 物理 = 相手の DEF で軽減 / tec: 技巧 = 相手の RES で軽減） */
  scale: 'atk' | 'tec';
  power: number;
  hits: number;
}

/** 同期条件（Ver.3 では unlockConditions。共通の Condition を使う） */
export type SyncCondition = Condition;

/** 探索能力（WORLD 探索・イベント解放で使用。PHASE 4） */
export interface FieldAbility {
  id: string;
  name: string;
  description: string;
}

/** 人物 Memory に記録された人格・記憶 */
export interface MemoryPersona {
  personality: string;
  /** 人物の記憶・口癖など */
  note?: string;
}

/**
 * 同期効果（GDD Ver.3 §2）。
 * Memory に同期したときに主人公へ反映される性質。メイン装備でのみ完全同期となる。
 */
export interface SyncEffects {
  /** 戦闘スタイル（ATTACK コマンドの通常攻撃） */
  style: AttackStyle;
  /** サブ装備時に使える補助スキル（skills のいずれか）。完全同期能力は使えない */
  supportSkill?: string;
  /** パッシブ装備時の能力値補正（割合。0.05 = +5%） */
  passiveBonus?: Partial<Record<StatKey, number>>;
  /** メイン装備時の REWRITE */
  rewrite?: string;
  /** 同期演出（MEMORY SYNC 画面のテーマ色・同期ログ） */
  direction?: { color?: string; lines?: string[] };
  /** メイン同期時の外見演出（主人公のオーラ色と名称） */
  appearance?: { aura: string; label: string };
}

export interface MemoryDefinition {
  id: string;
  name: string;
  /** 英字表記（演出・検索用） */
  nameEn?: string;
  /** 二つ名 */
  title?: string;
  category: MemoryCategory;
  rarity: Rarity;
  /** 戦闘属性（属性相性に使用） */
  attribute: Attribute;
  description: string;
  /** LOBBY 等で表示する一言 */
  quote?: string;
  /**
   * イラスト指定。
   * - 画像パス/URL（例: "assets/memories/MEM-0001.webp"）
   * - "gen:<motif>" … 手続き生成イラスト（画像が用意できるまでの代替）
   */
  illustration: string;
  /**
   * 固有ステータス（Lv1）。メインに同期すると、これが戦闘時の基本ステータスになる。
   * 戦闘能力を持たない Memory はすべて 0。
   */
  baseStats: StatBlock;
  /** 固有スキル（完全同期 = メイン装備時に使用可能） */
  skills: string[];
  /** パッシブ能力（メイン・パッシブ装備時に有効） */
  passive: string[];
  syncEffects: SyncEffects;
  /** 探索能力（WORLD 探索で使用） */
  fieldAbilities?: FieldAbility[];
  /** 人物の人格・記憶（HUMAN など） */
  persona?: MemoryPersona;
  acquisitionMethod: AcquisitionMethod[];
  relatedMemories: string[];
  /** 出現・帰属する WORLD（修復対象の世界） */
  worldId: string | null;
  /** 個別記録（ARCHIVE の MEMORY RECORD の ID） */
  storyRecords: string[];
  /** 同期条件（MEMORY SYNC に必要な条件。空なら接触するだけで同期できる） */
  unlockConditions: Condition[];
  tags?: string[];
}
