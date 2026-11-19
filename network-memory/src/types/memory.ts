/**
 * Memory マスターデータの型定義。
 *
 * Memory は Network に記録されたあらゆる存在がカード状に具現化したもの。
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
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tec: number;
  res: number;
  /** アクティブスキル ID（MemorySkills 参照） */
  skills: string[];
  /** パッシブスキル ID（MemorySkills 参照） */
  passiveSkills: string[];
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
