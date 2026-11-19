import { PLAYER_BASE_STATS, PLAYER_GROWTH_PER_LEVEL, SLOT_RULES } from '../constants';
import type { GameData } from '../data/gameData';
import { calcStats } from '../memory/stats';
import { STAT_KEYS, type Attribute, type AttackStyle, type FieldAbility, type MemoryDefinition, type StatBlock } from '../../types/memory';
import { LOADOUT_SLOT_TYPES, type LoadoutSlotType, type PlayerLoadout, type PlayerMemory, type PlayerSave } from '../../types/player';

/**
 * 主人公（GDD Ver.2 §3）。
 * プレイヤー自身が唯一の戦闘キャラクターで、装備した Memory の能力を同期して戦う。
 * 最終ステータス = 主人公の基礎値（レベル依存） + Σ（装備 Memory の補正 × スロット倍率）
 */

export function playerBaseStats(level: number): StatBlock {
  const lv = Math.max(1, Math.floor(level));
  const out = {} as StatBlock;
  for (const k of STAT_KEYS) out[k] = PLAYER_BASE_STATS[k] + PLAYER_GROWTH_PER_LEVEL[k] * (lv - 1);
  return out;
}

/** 通常攻撃（ATK と TEC の高い方を参照） */
export function defaultAttackStyle(def: MemoryDefinition | null): AttackStyle {
  if (!def) return { name: 'ストライク', scale: 'atk', power: 1, hits: 1 };
  if (def.attackStyle) return def.attackStyle;
  return { name: 'ストライク', scale: def.tec > def.atk ? 'tec' : 'atk', power: 1, hits: 1 };
}

export interface SlotContribution {
  slot: LoadoutSlotType;
  index: number;
  instance: PlayerMemory;
  def: MemoryDefinition;
  /** スロット倍率を適用した補正値 */
  bonus: StatBlock;
}

export interface GrantedAbility {
  skillId: string;
  memoryId: string;
}

export interface LoadoutAnalysis {
  level: number;
  base: StatBlock;
  bonus: StatBlock;
  total: StatBlock;
  contributions: SlotContribution[];
  /** 主人公の属性（メイン Memory の属性。未装備は DATA） */
  attribute: Attribute;
  attack: AttackStyle;
  main: SlotContribution | null;
  skills: GrantedAbility[];
  passives: GrantedAbility[];
  rewrite: GrantedAbility | null;
  fieldAbilities: (FieldAbility & { memoryId: string })[];
  /** 装備中 Memory の属性（パッシブ「群れの本能」等の判定用） */
  equippedAttributes: Attribute[];
}

export function analyzeLoadout(save: PlayerSave, data: GameData, loadout: PlayerLoadout): LoadoutAnalysis {
  const level = save.profile.level;
  const base = playerBaseStats(level);
  const bonus: StatBlock = { hp: 0, atk: 0, def: 0, spd: 0, tec: 0, res: 0 };
  const contributions: SlotContribution[] = [];
  const instById = new Map(save.memories.map((m) => [m.instanceId, m]));

  for (const slot of LOADOUT_SLOT_TYPES) {
    loadout.slots[slot].forEach((id, index) => {
      const instance = id ? instById.get(id) : undefined;
      const def = instance ? data.memoryById.get(instance.memoryId) : undefined;
      if (!instance || !def) return;
      const raw = calcStats(def, instance.level, instance.limitBreak);
      const rate = SLOT_RULES[slot].statRate;
      const b = {} as StatBlock;
      for (const k of STAT_KEYS) {
        b[k] = Math.round(raw[k] * rate);
        bonus[k] += b[k];
      }
      contributions.push({ slot, index, instance, def, bonus: b });
    });
  }

  const total = {} as StatBlock;
  for (const k of STAT_KEYS) total[k] = base[k] + bonus[k];

  const main = contributions.find((c) => c.slot === 'main') ?? null;
  const skills: GrantedAbility[] = [];
  const passives: GrantedAbility[] = [];
  const seenSkill = new Set<string>();
  for (const c of contributions) {
    const rule = SLOT_RULES[c.slot];
    if (rule.grantsSkills) {
      for (const s of c.def.skills) {
        if (seenSkill.has(s)) continue;
        seenSkill.add(s);
        skills.push({ skillId: s, memoryId: c.def.id });
      }
    }
    if (rule.grantsPassives) for (const s of c.def.passiveSkills) passives.push({ skillId: s, memoryId: c.def.id });
  }

  return {
    level,
    base,
    bonus,
    total,
    contributions,
    attribute: main?.def.attribute ?? 'DATA',
    attack: defaultAttackStyle(main?.def ?? null),
    main,
    skills,
    passives,
    rewrite: main?.def.rewrite ? { skillId: main.def.rewrite, memoryId: main.def.id } : null,
    fieldAbilities: contributions.flatMap((c) => (c.def.fieldAbilities ?? []).map((f) => ({ ...f, memoryId: c.def.id }))),
    equippedAttributes: contributions.map((c) => c.def.attribute),
  };
}

/** 主人公の総合力（装備込み） */
export function playerPower(a: LoadoutAnalysis): number {
  const s = a.total;
  return Math.round(s.hp * 0.2 + s.atk + s.def * 0.8 + s.spd * 0.9 + s.tec + s.res * 0.8);
}
