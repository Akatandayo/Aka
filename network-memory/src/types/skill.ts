import type { Attribute, StatKey } from './memory';

/**
 * MemorySkills の型定義。
 *
 * PHASE 1 では表示のみ。効果（effects）の解釈は PHASE 2 の Battle Engine が担う。
 * ここで定義した構造は Battle Engine の入力仕様となるため、拡張は「追加」で行うこと。
 */

export const SKILL_KINDS = ['active', 'passive', 'rewrite'] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

export const SKILL_TARGETS = [
  'self',
  'ally_single',
  'ally_all',
  'enemy_single',
  'enemy_all',
  'enemy_random',
  'all',
] as const;
export type SkillTarget = (typeof SKILL_TARGETS)[number];

export const STATUS_IDS = ['corrupt', 'stun', 'silence', 'glitch', 'seal'] as const;
export type StatusId = (typeof STATUS_IDS)[number];

export const PASSIVE_TRIGGERS = [
  'always',
  'battle_start',
  'turn_start',
  'on_damaged',
  'on_lethal',
  'on_status',
  'on_enemy_down',
] as const;
export type PassiveTrigger = (typeof PASSIVE_TRIGGERS)[number];

export const REWRITE_CONDITIONS = [
  'turn_at_least',
  'self_hp_below',
  'enemies_with_status_at_least',
  'units_down_at_least',
  'undefined',
] as const;
export type RewriteConditionType = (typeof REWRITE_CONDITIONS)[number];

export const EFFECT_TYPES = [
  'damage',
  'heal',
  'heal_percent',
  'buff',
  'debuff',
  'status',
  'cleanse',
  'dispel',
  'immune',
  'special',
] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

export interface SkillEffect {
  type: EffectType;
  /** 効果対象（省略時はスキルの target） */
  target?: SkillTarget;
  /** damage/heal: 参照ステータス */
  scale?: StatKey;
  /** damage/heal: 倍率 */
  power?: number;
  /** damage: ヒット数 */
  hits?: number;
  /** buff/debuff: 対象ステータス */
  stat?: StatKey;
  /** buff/debuff/heal_percent: 割合（0.1 = 10%） */
  value?: number;
  /** status: 状態異常 ID */
  status?: StatusId;
  /** status 等: 発動確率（0〜1） */
  chance?: number;
  /** 継続ターン */
  turns?: number;
  /** special: Battle Engine 側で実装する固有処理 ID */
  id?: string;
}

export interface RewriteCondition {
  type: RewriteConditionType;
  value?: number;
}

/** REWRITE 等の演出指定（PHASE 2/3 の演出システムが解釈する） */
export interface SkillDirection {
  /** カットイン時のセリフ/テキスト */
  cutin?: string;
  glitch?: boolean;
  shake?: boolean;
  /** 演出のテーマカラー（CSS カラー） */
  color?: string;
}

export interface SkillDefinition {
  id: string;
  name: string;
  nameEn?: string;
  kind: SkillKind;
  attribute?: Attribute;
  description: string;
  target?: SkillTarget;
  /** active/rewrite: 再使用までのターン数 */
  cooldown?: number;
  /** passive: 発動タイミング */
  trigger?: PassiveTrigger;
  /** rewrite: 発動条件 */
  condition?: RewriteCondition;
  /** 発動条件の表示テキスト（rewrite 用） */
  conditionText?: string;
  effects: SkillEffect[];
  direction?: SkillDirection;
}
