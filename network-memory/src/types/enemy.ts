import type { Attribute, AttackStyle } from './memory';
import type { Currency } from './player';

/**
 * 敵と遭遇（エンカウント）のマスターデータ。
 * PHASE 2 では BATTLE 画面の「流出反応」から直接接続する。
 * PHASE 4 で WORLD のエリア・クエストに配置される。
 */

export type EnemyAiCondition =
  | { type: 'hp_below'; value: number }
  | { type: 'hp_above'; value: number }
  | { type: 'turn_at_least'; value: number };

export interface EnemyAiRule {
  /** 使用するスキル ID。'attack' は通常攻撃 */
  action: string;
  weight: number;
  when?: EnemyAiCondition;
}

export interface EnemyDefinition {
  id: string;
  name: string;
  nameEn?: string;
  description: string;
  attribute: Attribute;
  level: number;
  /** 手続き生成イラストのシード補助（省略時は ID） */
  illustration?: string;
  boss: boolean;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  tec: number;
  res: number;
  attack: AttackStyle;
  skills: string[];
  passiveSkills: string[];
  ai: EnemyAiRule[];
}

export type EncounterUnlock = { type: 'initial' } | { type: 'encounterClear'; encounterId: string };

export interface EncounterReward {
  exp: number;
  /** 装備中 Memory が得る同期経験値 */
  memoryExp: number;
  currencies?: Partial<Record<Currency, number>>;
  items?: Record<string, number>;
}

export interface EncounterFirstClear {
  /** 初回クリア時に検出される Memory（MEMORY SYNC の対象） */
  memories?: string[];
  currencies?: Partial<Record<Currency, number>>;
  items?: Record<string, number>;
}

export interface EncounterDefinition {
  id: string;
  worldId: string;
  name: string;
  description: string;
  recommendedLevel: number;
  boss: boolean;
  /** 出現する敵 ID（最大 3） */
  enemies: string[];
  unlock: EncounterUnlock;
  rewards: EncounterReward;
  firstClear?: EncounterFirstClear;
}
