import { createId } from '../id';
import type { GameData } from '../data/gameData';
import { maxLevel } from '../memory/stats';
import type { PlayerMemory, PlayerSave } from '../../types/player';

/** 所持 Memory の操作（入手・お気に入り等） */

export function createPlayerMemory(memoryId: string, acquiredFrom: string, at: string): PlayerMemory {
  return {
    instanceId: createId('pm'),
    memoryId,
    level: 1,
    exp: 0,
    limitBreak: 0,
    skillLevels: {},
    form: null,
    favorite: false,
    acquiredAt: at,
    acquiredFrom,
  };
}

export type AcquireResult = { ok: true; save: PlayerSave; instance: PlayerMemory } | { ok: false; error: string };

/**
 * Memory を入手する。入手した Memory は自動的に「発見済み」になる。
 * 重複入手時の扱い（限界突破素材化など）は PHASE 2 の育成仕様で決定する。
 */
export function acquireMemory(save: PlayerSave, data: GameData, memoryId: string, acquiredFrom: string, at: string): AcquireResult {
  if (!data.memoryById.has(memoryId)) return { ok: false, error: `存在しないMemoryです: ${memoryId}` };
  const instance = createPlayerMemory(memoryId, acquiredFrom, at);
  const discovered = save.archive.discoveredMemoryIds.includes(memoryId)
    ? save.archive.discoveredMemoryIds
    : [...save.archive.discoveredMemoryIds, memoryId];
  return {
    ok: true,
    instance,
    save: {
      ...save,
      memories: [...save.memories, instance],
      archive: { ...save.archive, discoveredMemoryIds: discovered },
    },
  };
}

export function findInstance(save: PlayerSave, instanceId: string): PlayerMemory | undefined {
  return save.memories.find((m) => m.instanceId === instanceId);
}

export function updateInstance(save: PlayerSave, instanceId: string, patch: (m: PlayerMemory) => PlayerMemory): PlayerSave {
  let changed = false;
  const memories = save.memories.map((m) => {
    if (m.instanceId !== instanceId) return m;
    changed = true;
    return patch(m);
  });
  return changed ? { ...save, memories } : save;
}

export function toggleFavorite(save: PlayerSave, instanceId: string): PlayerSave {
  return updateInstance(save, instanceId, (m) => ({ ...m, favorite: !m.favorite }));
}

/** インスタンスのレベルを上限内に収める */
export function clampInstanceLevel(m: PlayerMemory, data: GameData): PlayerMemory {
  const def = data.memoryById.get(m.memoryId);
  if (!def) return m;
  const cap = maxLevel(def.rarity, m.limitBreak);
  return m.level > cap ? { ...m, level: cap } : m;
}
