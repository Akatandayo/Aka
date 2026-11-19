import type { Attribute, MemoryCategory, Rarity, StatKey } from '../types/memory';
import type { Currency, LoadoutCapacity, LoadoutSlotType } from '../types/player';
import type { SkillTarget, StatusId } from '../types/skill';

/**
 * 表示・ゲームバランス用のメタデータ。
 * 値の追加・調整はここで一元管理する。
 */

export interface RarityMeta {
  label: string;
  short: string;
  /** ソート用の序列（大きいほど高レア） */
  order: number;
  color: string;
  /** 限界突破 0 段階での最大レベル */
  baseMaxLevel: number;
}

export const RARITY_META: Record<Rarity, RarityMeta> = {
  COMMON: { label: 'COMMON', short: 'C', order: 0, color: '#9aa8c2', baseMaxLevel: 30 },
  UNCOMMON: { label: 'UNCOMMON', short: 'UC', order: 1, color: '#5fe3c0', baseMaxLevel: 40 },
  RARE: { label: 'RARE', short: 'R', order: 2, color: '#4ea8ff', baseMaxLevel: 50 },
  EPIC: { label: 'EPIC', short: 'EP', order: 3, color: '#b47bff', baseMaxLevel: 60 },
  LEGEND: { label: 'LEGEND', short: 'LG', order: 4, color: '#ffc94d', baseMaxLevel: 70 },
  IRREGULAR: { label: 'IRREGULAR', short: 'IR', order: 5, color: '#ff3b5c', baseMaxLevel: 80 },
};

export interface AttributeMeta {
  label: string;
  ja: string;
  color: string;
  description: string;
}

export const ATTRIBUTE_META: Record<Attribute, AttributeMeta> = {
  DATA: { label: 'DATA', ja: '情報', color: '#3ee8ff', description: '正しく記録された情報の力。' },
  VOID: { label: 'VOID', ja: '虚無', color: '#8f7bff', description: '記録の欠落、空白そのものの力。' },
  ERROR: { label: 'ERROR', ja: '破損', color: '#ff3b5c', description: '壊れ、歪んだ記録の力。' },
  LIFE: { label: 'LIFE', ja: '生命', color: '#4dffa6', description: '生きて変化し続ける記録の力。' },
  CHAOS: { label: 'CHAOS', ja: '混沌', color: '#ff7ad9', description: '秩序を持たない、ゆらぎの力。' },
  ORDER: { label: 'ORDER', ja: '秩序', color: '#ffd36b', description: '分類され、律された記録の力。' },
};

export const CATEGORY_META: Record<MemoryCategory, { label: string; ja: string }> = {
  HUMAN: { label: 'HUMAN', ja: '人間' },
  CREATURE: { label: 'CREATURE', ja: '生物' },
  CONCEPT: { label: 'CONCEPT', ja: '概念' },
  OBJECT: { label: 'OBJECT', ja: '物体' },
  LOCATION: { label: 'LOCATION', ja: '場所' },
  EVENT: { label: 'EVENT', ja: '出来事' },
  UNKNOWN: { label: 'UNKNOWN', ja: '不明' },
};

export const STAT_META: Record<StatKey, { label: string; ja: string; /** 資質表示の基準値 */ reference: number }> = {
  hp: { label: 'HP', ja: '耐久', reference: 1000 },
  atk: { label: 'ATK', ja: '攻撃', reference: 160 },
  def: { label: 'DEF', ja: '防御', reference: 160 },
  spd: { label: 'SPD', ja: '速度', reference: 160 },
  tec: { label: 'TEC', ja: '技巧', reference: 160 },
  res: { label: 'RES', ja: '抵抗', reference: 160 },
};

export const CURRENCY_META: Record<Currency, { label: string; ja: string; color: string; description: string }> = {
  DATA: { label: 'DATA', ja: 'データ', color: '#3ee8ff', description: '基本通貨。Memoryのレベルアップなどに使用する。' },
  FRAGMENT: { label: 'FRAGMENT', ja: 'フラグメント', color: '#b47bff', description: 'Memoryの断片。スキル強化・限界突破・融合に使用する。' },
  CORE: { label: 'CORE', ja: 'コア', color: '#ffc94d', description: '高密度の記録結晶。特殊形態の解放に使用する。' },
  CREDIT: { label: 'CREDIT', ja: 'クレジット', color: '#e6f1ff', description: 'Network内の信用通貨。SHOPでの交換に使用する。' },
};

export const STATUS_META: Record<StatusId, { label: string; description: string }> = {
  corrupt: { label: '侵食', description: 'ターン終了時に継続ダメージを受ける。' },
  stun: { label: '停止', description: '行動できない。' },
  silence: { label: '沈黙', description: 'アクティブスキルを使用できない。' },
  glitch: { label: '混線', description: '行動の対象がランダムになる。' },
  seal: { label: '施錠', description: 'パッシブスキルが無効になる。' },
};

export const TARGET_LABEL: Record<SkillTarget, string> = {
  self: '自身',
  ally_single: '味方単体',
  ally_all: '味方全体',
  enemy_single: '敵単体',
  enemy_all: '敵全体',
  enemy_random: '敵ランダム',
  all: '全体',
};

/** 限界突破の上限段階 */
export const MAX_LIMIT_BREAK = 4;
/** 限界突破 1 段階ごとの最大レベル上昇 */
export const LEVEL_CAP_PER_LIMIT_BREAK = 10;
/** レベル 1 上昇ごとのステータス成長率（基礎値に対する割合） */
export const STAT_GROWTH_PER_LEVEL = 0.05;
/** 限界突破 1 段階ごとのステータス補正 */
export const STAT_BONUS_PER_LIMIT_BREAK = 0.05;

// =====================================================================
// GDD Ver.2: 主人公・Memory装備・戦闘
// =====================================================================


/** 主人公の基礎ステータス（Lv1）と 1 レベルごとの成長 */
export const PLAYER_BASE_STATS = { hp: 300, atk: 30, def: 30, spd: 30, tec: 30, res: 30 } as const;
export const PLAYER_GROWTH_PER_LEVEL = { hp: 50, atk: 6, def: 6, spd: 4, tec: 6, res: 6 } as const;
export const PLAYER_MAX_LEVEL = 99;

/** 装備枠の初期数（将来拡張可能。セーブデータの loadoutCapacity が優先される） */
export const DEFAULT_LOADOUT_CAPACITY: LoadoutCapacity = { main: 1, sub: 3, passive: 2 };
/** 装備枠の上限（拡張時の安全上限） */
export const MAX_LOADOUT_CAPACITY: LoadoutCapacity = { main: 1, sub: 6, passive: 4 };

export interface SlotRule {
  label: string;
  ja: string;
  description: string;
  /** ステータス補正の適用倍率 */
  statRate: number;
  /** アクティブスキル（MEMORY SKILL）を追加するか */
  grantsSkills: boolean;
  /** パッシブ効果が有効になるか */
  grantsPassives: boolean;
  /** REWRITE・属性・通常攻撃（戦闘スタイル）を決定するか */
  definesStyle: boolean;
}

export const SLOT_RULES: Record<LoadoutSlotType, SlotRule> = {
  main: {
    label: 'MAIN',
    ja: 'メイン',
    description: '戦闘スタイルの基本（属性・通常攻撃・REWRITE）を決定し、スキルとパッシブも使用可能。補正100%。',
    statRate: 1,
    grantsSkills: true,
    grantsPassives: true,
    definesStyle: true,
  },
  sub: {
    label: 'SUB',
    ja: 'サブ',
    description: '戦闘中に使えるスキル（MEMORY SKILL）を追加する。補正30%。',
    statRate: 0.3,
    grantsSkills: true,
    grantsPassives: false,
    definesStyle: false,
  },
  passive: {
    label: 'PASSIVE',
    ja: 'パッシブ',
    description: 'パッシブ効果と能力値に影響する。補正50%。',
    statRate: 0.5,
    grantsSkills: false,
    grantsPassives: true,
    definesStyle: false,
  },
};

/**
 * 属性相性。ADVANTAGE[攻撃側] = 有利を取れる防御側の属性。
 *   DATA → VOID → LIFE → ERROR → DATA（4すくみ）
 *   ORDER ⇄ CHAOS（互いに有利）
 */
export const ATTRIBUTE_ADVANTAGE: Record<Attribute, Attribute[]> = {
  DATA: ['VOID'],
  VOID: ['LIFE'],
  LIFE: ['ERROR'],
  ERROR: ['DATA'],
  ORDER: ['CHAOS'],
  CHAOS: ['ORDER'],
};
export const AFFINITY_ADVANTAGE_RATE = 1.5;
export const AFFINITY_DISADVANTAGE_RATE = 0.75;

/** 戦闘のリソース・ルール */
export const BATTLE_RULES = {
  maxEnemies: 3,
  maxRounds: 30,
  spMax: 100,
  spStart: 30,
  /** 自分の行動開始時に回復する SP */
  spRegen: 15,
  /** DEFEND 時に追加で回復する SP */
  spDefendBonus: 20,
  /** DEFEND 中の被ダメージ倍率 */
  defendRate: 0.5,
  /** ダメージ式 dmg = 攻撃値 × 威力 × K / (K + 防御値) */
  defenseK: 300,
  critRate: 0.05,
  critMultiplier: 1.5,
  variance: 0.08,
  /** 侵食の継続ダメージ（最大HP比） */
  corruptRate: 0.06,
  /** ステータス倍率の下限・上限 */
  modifierFloor: 0.25,
  modifierCeil: 3,
} as const;

/** 重複して入手した Memory を FRAGMENT に変換するときの量 */
export const DUPLICATE_FRAGMENTS: Record<Rarity, number> = {
  COMMON: 10,
  UNCOMMON: 20,
  RARE: 40,
  EPIC: 80,
  LEGEND: 160,
  IRREGULAR: 300,
};
