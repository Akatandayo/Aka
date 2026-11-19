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


/**
 * 主人公の共通成長（GDD Ver.3 §2: 主人公の共通成長要素は別管理）。
 * 戦闘時の基本ステータスはメイン Memory が決め、主人公のレベルは全ステータスへの倍率として効く。
 */
export const PLAYER_SYNC_GROWTH_PER_LEVEL = 0.03;
/** どの Memory とも同期していないときの能力（戦闘にはメイン Memory が必須） */
export const UNSYNCED_STATS = { hp: 600, atk: 60, def: 60, spd: 60, tec: 60, res: 60 } as const;
/** パッシブ枠の能力値補正は Memory のレベルで少し伸びる（1 レベルごと +2%） */
export const PASSIVE_BONUS_GROWTH_PER_LEVEL = 0.02;
export const PLAYER_MAX_LEVEL = 99;

/** 装備枠の初期数（将来拡張可能。セーブデータの loadoutCapacity が優先される） */
export const DEFAULT_LOADOUT_CAPACITY: LoadoutCapacity = { main: 1, sub: 3, passive: 2 };
/** 装備枠の上限（拡張時の安全上限） */
export const MAX_LOADOUT_CAPACITY: LoadoutCapacity = { main: 1, sub: 6, passive: 4 };

export interface SlotRule {
  label: string;
  ja: string;
  description: string;
}

/** 装備枠の役割（GDD Ver.3 §3） */
export const SLOT_RULES: Record<LoadoutSlotType, SlotRule> = {
  main: {
    label: 'MAIN',
    ja: 'メイン',
    description: '完全同期。戦闘時のステータス・属性・戦闘スタイル・スキル・パッシブ・REWRITE・外見を決定する。',
  },
  sub: {
    label: 'SUB',
    ja: 'サブ',
    description: 'その Memory の補助スキルを 1 つだけ借りる。完全同期能力やステータスは反映されない。',
  },
  passive: {
    label: 'PASSIVE',
    ja: 'パッシブ',
    description: 'その Memory のパッシブ能力と、能力値の補正（数%）が有効になる。',
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
  /** SYNC ENERGY（Memory スキルの共通消費リソース） */
  energyMax: 100,
  energyStart: 30,
  /** 自分の行動開始時に回復する SYNC ENERGY */
  energyRegen: 15,
  /** DEFEND 時に追加で回復する SYNC ENERGY */
  energyDefendBonus: 20,
  /** REWRITE GAUGE（行動で蓄積し、最大で REWRITE を発動できる） */
  gaugeMax: 100,
  gaugeOnAttack: 9,
  gaugeOnSkill: 11,
  gaugeOnDefend: 7,
  gaugeOnItem: 3,
  /** 与えたダメージ 1 ヒットごと */
  gaugePerHit: 3,
  /** 受けたダメージ（最大HP比）× この値 */
  gaugeOnDamageTaken: 70,
  gaugeOnEnemyDown: 10,
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
