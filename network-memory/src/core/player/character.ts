import { PASSIVE_BONUS_GROWTH_PER_LEVEL, PLAYER_SYNC_GROWTH_PER_LEVEL, UNSYNCED_STATS } from '../constants';
import type { GameData } from '../data/gameData';
import { calcStats } from '../memory/stats';
import { STAT_KEYS, type Attribute, type AttackStyle, type FieldAbility, type MemoryDefinition, type StatBlock, type StatKey } from '../../types/memory';
import { LOADOUT_SLOT_TYPES, type LoadoutSlotType, type PlayerLoadout, type PlayerMemory, type PlayerSave } from '../../types/player';

/**
 * 主人公と MEMORY SYNC（GDD Ver.3 §2・§3）。
 *
 * - 完全同期型: メイン Memory の固有ステータス（Memory のレベル反映）が、戦闘時の基本ステータスになる
 * - 主人公の共通成長は別管理: 主人公のレベルが全ステータスへの倍率として効く
 * - サブ: 補助スキルを 1 つ借りるだけ（完全同期能力・ステータスは反映しない）
 * - パッシブ: パッシブ能力 + 能力値の補正（割合）
 *
 * 最終ステータス = メインの固有ステータス × (1 + 共通成長 + Σ パッシブ補正)
 */

/** 主人公の共通成長による倍率の加算分（Lv1 = 0） */
export function playerGrowthRate(level: number): number {
  return PLAYER_SYNC_GROWTH_PER_LEVEL * (Math.max(1, Math.floor(level)) - 1);
}

/** 戦闘スタイル（メイン Memory の通常攻撃） */
export function defaultAttackStyle(def: MemoryDefinition | null): AttackStyle {
  if (!def) return { name: 'ストライク', scale: 'atk', power: 1, hits: 1 };
  return def.syncEffects.style;
}

/** パッシブ枠での能力値補正（Memory のレベルで少し伸びる） */
export function passiveBonusOf(def: MemoryDefinition, m: PlayerMemory): Partial<Record<StatKey, number>> {
  const mult = 1 + PASSIVE_BONUS_GROWTH_PER_LEVEL * (m.level - 1);
  const out: Partial<Record<StatKey, number>> = {};
  for (const [k, v] of Object.entries(def.syncEffects.passiveBonus ?? {})) out[k as StatKey] = (v ?? 0) * mult;
  return out;
}

export interface SlotContribution {
  slot: LoadoutSlotType;
  index: number;
  instance: PlayerMemory;
  def: MemoryDefinition;
}

export interface GrantedAbility {
  skillId: string;
  memoryId: string;
}

export interface LoadoutAnalysis {
  level: number;
  /** メイン Memory の固有ステータス（Memory のレベル反映） */
  base: StatBlock;
  /** 共通成長 + パッシブ補正による増加分 */
  bonus: StatBlock;
  total: StatBlock;
  /** 倍率の内訳（割合） */
  rates: { growth: number; passive: Partial<Record<StatKey, number>> };
  contributions: SlotContribution[];
  /** 主人公の属性（メイン Memory の属性。未同期は DATA） */
  attribute: Attribute;
  attack: AttackStyle;
  main: SlotContribution | null;
  skills: GrantedAbility[];
  passives: GrantedAbility[];
  rewrite: GrantedAbility | null;
  /** メイン同期時の外見演出 */
  appearance: { aura: string; label: string } | null;
  fieldAbilities: (FieldAbility & { memoryId: string })[];
  /** 装備中 Memory の属性（パッシブ「群れの本能」等の判定用） */
  equippedAttributes: Attribute[];
}

export function analyzeLoadout(save: PlayerSave, data: GameData, loadout: PlayerLoadout): LoadoutAnalysis {
  const level = save.profile.level;
  const contributions: SlotContribution[] = [];
  const instById = new Map(save.memories.map((m) => [m.instanceId, m]));
  for (const slot of LOADOUT_SLOT_TYPES) {
    loadout.slots[slot].forEach((id, index) => {
      const instance = id ? instById.get(id) : undefined;
      const def = instance ? data.memoryById.get(instance.memoryId) : undefined;
      if (instance && def) contributions.push({ slot, index, instance, def });
    });
  }
  const main = contributions.find((c) => c.slot === 'main') ?? null;
  const base: StatBlock = main ? calcStats(main.def, main.instance.level, main.instance.limitBreak) : { ...UNSYNCED_STATS };

  const growth = playerGrowthRate(level);
  const passiveRates: Partial<Record<StatKey, number>> = {};
  for (const c of contributions) {
    if (c.slot !== 'passive') continue;
    for (const [k, v] of Object.entries(passiveBonusOf(c.def, c.instance))) passiveRates[k as StatKey] = (passiveRates[k as StatKey] ?? 0) + (v ?? 0);
  }
  const total = {} as StatBlock;
  const bonus = {} as StatBlock;
  for (const k of STAT_KEYS) {
    total[k] = Math.round(base[k] * (1 + growth + (passiveRates[k] ?? 0)));
    bonus[k] = total[k] - base[k];
  }

  const skills: GrantedAbility[] = [];
  const passives: GrantedAbility[] = [];
  const seen = new Set<string>();
  const addSkill = (skillId: string, memoryId: string) => {
    if (seen.has(skillId)) return;
    seen.add(skillId);
    skills.push({ skillId, memoryId });
  };
  if (main) {
    for (const s of main.def.skills) addSkill(s, main.def.id);
    for (const s of main.def.passive) passives.push({ skillId: s, memoryId: main.def.id });
  }
  for (const c of contributions) {
    if (c.slot === 'sub' && c.def.syncEffects.supportSkill) addSkill(c.def.syncEffects.supportSkill, c.def.id);
    if (c.slot === 'passive') for (const s of c.def.passive) passives.push({ skillId: s, memoryId: c.def.id });
  }

  return {
    level,
    base,
    bonus,
    total,
    rates: { growth, passive: passiveRates },
    contributions,
    attribute: main?.def.attribute ?? 'DATA',
    attack: defaultAttackStyle(main?.def ?? null),
    main,
    skills,
    passives,
    rewrite: main?.def.syncEffects.rewrite ? { skillId: main.def.syncEffects.rewrite, memoryId: main.def.id } : null,
    appearance: main?.def.syncEffects.appearance ?? null,
    fieldAbilities: contributions.flatMap((c) => (c.def.fieldAbilities ?? []).map((f) => ({ ...f, memoryId: c.def.id }))),
    equippedAttributes: contributions.map((c) => c.def.attribute),
  };
}

/** 主人公の総合力（装備込み） */
export function playerPower(a: LoadoutAnalysis): number {
  const s = a.total;
  return Math.round(s.hp * 0.2 + s.atk + s.def * 0.8 + s.spd * 0.9 + s.tec + s.res * 0.8);
}
