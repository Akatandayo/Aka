import { PLAYER_MAX_LEVEL } from '../constants';
import { expToNext, maxLevel } from '../memory/stats';
import type { PlayerMemory } from '../../types/player';
import type { MemoryDefinition } from '../../types/memory';

/** 経験値の加算とレベルアップ（主人公・Memory 共通の曲線: 100 × Lv^1.5） */

export interface LevelResult {
  level: number;
  exp: number;
  gained: number;
}

export function addExp(level: number, exp: number, gain: number, cap: number): LevelResult {
  let lv = level;
  let xp = exp + Math.max(0, Math.floor(gain));
  while (lv < cap && xp >= expToNext(lv)) {
    xp -= expToNext(lv);
    lv++;
  }
  if (lv >= cap) xp = 0;
  return { level: lv, exp: xp, gained: lv - level };
}

export function addPlayerExp(level: number, exp: number, gain: number): LevelResult {
  return addExp(level, exp, gain, PLAYER_MAX_LEVEL);
}

/** Memory の同期経験値（装備して戦うことで同期が深まり、レベルが上がる） */
export function addMemoryExp(m: PlayerMemory, def: MemoryDefinition, gain: number): { memory: PlayerMemory; gained: number } {
  const r = addExp(m.level, m.exp, gain, maxLevel(def.rarity, m.limitBreak));
  return { memory: { ...m, level: r.level, exp: r.exp }, gained: r.gained };
}
