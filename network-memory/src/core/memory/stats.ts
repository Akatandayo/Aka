import {
  LEVEL_CAP_PER_LIMIT_BREAK,
  MAX_LIMIT_BREAK,
  RARITY_META,
  STAT_BONUS_PER_LIMIT_BREAK,
  STAT_GROWTH_PER_LEVEL,
} from '../constants';
import { STAT_KEYS, type MemoryDefinition, type Rarity, type StatBlock } from '../../types/memory';

/** 基礎ステータス（Lv1・限界突破0） */
export function baseStats(def: MemoryDefinition): StatBlock {
  return { hp: def.hp, atk: def.atk, def: def.def, spd: def.spd, tec: def.tec, res: def.res };
}

export function clampLimitBreak(limitBreak: number): number {
  return Math.max(0, Math.min(MAX_LIMIT_BREAK, Math.floor(limitBreak)));
}

export function maxLevel(rarity: Rarity, limitBreak: number): number {
  return RARITY_META[rarity].baseMaxLevel + clampLimitBreak(limitBreak) * LEVEL_CAP_PER_LIMIT_BREAK;
}

/** レベル・限界突破を反映した実ステータス */
export function calcStats(def: MemoryDefinition, level: number, limitBreak: number): StatBlock {
  const lb = clampLimitBreak(limitBreak);
  const lv = Math.max(1, Math.min(maxLevel(def.rarity, lb), Math.floor(level)));
  const mult = (1 + STAT_GROWTH_PER_LEVEL * (lv - 1)) * (1 + STAT_BONUS_PER_LIMIT_BREAK * lb);
  const base = baseStats(def);
  const out = {} as StatBlock;
  for (const k of STAT_KEYS) out[k] = Math.round(base[k] * mult);
  return out;
}

/** 総合力（CP）。編成・ソートの目安として使う */
export function combatPower(s: StatBlock): number {
  return Math.round(s.hp * 0.2 + s.atk * 1.0 + s.def * 0.8 + s.spd * 0.9 + s.tec * 1.0 + s.res * 0.8);
}

/** 次のレベルまでに必要な経験値（主人公・Memory 共通の曲線: 50 × Lv^1.5） */
export function expToNext(level: number): number {
  return Math.round(50 * Math.pow(Math.max(1, level), 1.5));
}
