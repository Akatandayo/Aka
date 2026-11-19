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

/** 同期条件（MEMORY SYNC に必要な条件） */
export type SyncCondition =
  | { type: 'playerLevel'; value: number }
  | { type: 'ownedMemory'; memoryId: string }
  | { type: 'flag'; flag: string; label: string }
  /** 条件不明（現時点では同期できない） */
  | { type: 'unknown' };

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
   * ステータス補正（Lv1 時）。装備すると主人公のステータスに加算される（スロットごとに倍率あり）。
   * 戦闘能力を持たない Memory は 0 でよい。
   */
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tec: number;
  res: number;
  /** アクティブスキル ID（MemorySkills 参照）。空なら戦闘スキルを持たない */
  skills: string[];
  /** パッシブスキル ID（MemorySkills 参照） */
  passiveSkills: string[];
  /** メイン装備時の通常攻撃（省略時は ATK/TEC の高い方から自動決定） */
  attackStyle?: AttackStyle;
  /** 同期条件（省略時は条件なし） */
  syncCondition?: SyncCondition[];
  /** 探索能力 */
  fieldAbilities?: FieldAbility[];
  /** 人物の人格・記憶（HUMAN など） */
  persona?: MemoryPersona;
  /** REWRITE スキル ID（任意） */
  rewrite?: string;
  acquisitionMethod: AcquisitionMethod[];
  relatedMemories: string[];
  /** Memory 固有の記録（MemoryStory）ID */
  storyId: string | null;
  /** 出現する WORLD */
  worldId?: string | null;
  tags?: string[];
}
