import { BATTLE_RULES } from '../constants';
import type { GameData } from '../data/gameData';
import { analyzeLoadout } from '../player/character';
import { getActiveLoadout, getLoadout } from '../player/loadout';
import type { BattleSetup, BattleUnit } from './types';
import type { EncounterDefinition, EnemyDefinition } from '../../types/enemy';
import type { PlayerLoadout, PlayerSave } from '../../types/player';

/** 戦闘の準備: 主人公（装備 Memory から能力を同期）と敵ユニットを組み立てる */

export function buildPlayerUnit(save: PlayerSave, data: GameData, loadout: PlayerLoadout): BattleUnit {
  const a = analyzeLoadout(save, data, loadout);
  return {
    uid: 'P',
    side: 'player',
    name: save.profile.name,
    refId: 'PLAYER',
    level: save.profile.level,
    attribute: a.attribute,
    baseAttribute: a.attribute,
    attributeTurns: 0,
    stats: { ...a.total },
    hp: a.total.hp,
    maxHp: a.total.hp,
    sp: BATTLE_RULES.spStart,
    maxSp: BATTLE_RULES.spMax,
    attack: { ...a.attack },
    skills: a.skills.map((s) => ({ skillId: s.skillId, sourceMemoryId: s.memoryId, cooldown: 0 })),
    passives: a.passives.map((p) => ({ skillId: p.skillId, sourceMemoryId: p.memoryId, stacks: 0 })),
    modifiers: [],
    statuses: [],
    defending: false,
    immuneTurns: 0,
    empower: null,
    endureUsed: false,
    alive: true,
    boss: false,
    ai: [],
    equippedAttributes: a.equippedAttributes,
  };
}

const SUFFIX = ['A', 'B', 'C', 'D'];

export function buildEnemyUnits(defs: EnemyDefinition[]): BattleUnit[] {
  const counts = new Map<string, number>();
  for (const d of defs) counts.set(d.id, (counts.get(d.id) ?? 0) + 1);
  const seen = new Map<string, number>();
  return defs.map((d, i) => {
    const n = seen.get(d.id) ?? 0;
    seen.set(d.id, n + 1);
    const name = (counts.get(d.id) ?? 0) > 1 ? `${d.name} ${SUFFIX[n]}` : d.name;
    return {
      uid: `E${i + 1}`,
      side: 'enemy',
      name,
      refId: d.id,
      level: d.level,
      attribute: d.attribute,
      baseAttribute: d.attribute,
      attributeTurns: 0,
      stats: { hp: d.hp, atk: d.atk, def: d.def, spd: d.spd, tec: d.tec, res: d.res },
      hp: d.hp,
      maxHp: d.hp,
      sp: 0,
      maxSp: 0,
      attack: { ...d.attack },
      skills: d.skills.map((s) => ({ skillId: s, sourceMemoryId: null, cooldown: 0 })),
      passives: d.passiveSkills.map((s) => ({ skillId: s, sourceMemoryId: null, stacks: 0 })),
      modifiers: [],
      statuses: [],
      defending: false,
      immuneTurns: 0,
      empower: null,
      endureUsed: false,
      alive: true,
      boss: d.boss,
      ai: d.ai,
      equippedAttributes: [],
    };
  });
}

export function isEncounterUnlocked(save: PlayerSave, enc: EncounterDefinition): boolean {
  return enc.unlock.type === 'initial' || Boolean(save.battle.encounters[enc.unlock.encounterId]);
}

export type EncounterStatus = 'locked' | 'available' | 'cleared';

export function encounterStatus(save: PlayerSave, enc: EncounterDefinition): EncounterStatus {
  if (save.battle.encounters[enc.id]) return 'cleared';
  return isEncounterUnlocked(save, enc) ? 'available' : 'locked';
}

export type SetupResult = { ok: true; setup: BattleSetup; loadoutId: string } | { ok: false; error: string };

export function createBattleSetup(save: PlayerSave, data: GameData, encounterId: string, seed: number, loadoutId?: string): SetupResult {
  const enc = data.encounterById.get(encounterId);
  if (!enc) return { ok: false, error: '流出反応が見つかりません' };
  if (!isEncounterUnlocked(save, enc)) return { ok: false, error: 'この流出反応にはまだ接続できません' };
  const loadout = loadoutId ? getLoadout(save, loadoutId) : getActiveLoadout(save);
  if (!loadout) return { ok: false, error: '装備プリセットが存在しません' };
  if (!loadout.slots.main.some((x) => x !== null)) return { ok: false, error: 'メインMemoryを装備してください' };
  const player = buildPlayerUnit(save, data, loadout);
  const enemies = buildEnemyUnits(enc.enemies.map((id) => data.enemyById.get(id)!).filter(Boolean));
  const a = analyzeLoadout(save, data, loadout);
  const items: Record<string, number> = {};
  for (const [id, n] of Object.entries(save.inventory)) if (data.itemById.get(id)?.battle && n > 0) items[id] = n;
  return {
    ok: true,
    loadoutId: loadout.id,
    setup: {
      encounterId,
      seed,
      player,
      enemies,
      rewrite: { skillId: a.rewrite?.skillId ?? null, memoryId: a.rewrite?.memoryId ?? null },
      items,
    },
  };
}
