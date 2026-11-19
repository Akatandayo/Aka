import type { GameData } from '../data/gameData';
import { acquireMemory } from './memories';
import type { SyncCondition } from '../../types/memory';
import type { PlayerMemory, PlayerSave } from '../../types/player';

/**
 * MEMORY SYNC（GDD Ver.2 §4）
 *   1. Memory を発見する（戦闘・探索で検出 → archive.pendingSyncIds）
 *   2. Memory に接触する（UI: 接触演出）
 *   3. 同期条件を判定する
 *   4. Memory の情報を主人公に同期する（PlayerMemory を作成）
 *   5. 能力が使用可能になる（装備できる）
 *   6. Memory 一覧に登録される
 */

export interface SyncCheck {
  ok: boolean;
  conditions: { text: string; met: boolean }[];
}

function describe(c: SyncCondition, data: GameData, save: PlayerSave): { text: string; met: boolean } {
  switch (c.type) {
    case 'playerLevel':
      return { text: `探索者 Lv.${c.value} 以上`, met: save.profile.level >= c.value };
    case 'ownedMemory': {
      const m = data.memoryById.get(c.memoryId);
      const known = save.archive.discoveredMemoryIds.includes(c.memoryId) || save.memories.some((x) => x.memoryId === c.memoryId);
      return { text: `『${m && known ? m.name : '未発見のMemory'}』と同期済み`, met: save.memories.some((x) => x.memoryId === c.memoryId) };
    }
    case 'flag':
      return { text: c.label, met: Boolean(save.progress.flags[c.flag]) };
    case 'unknown':
      return { text: 'ERROR: 同期条件を解析できない', met: false };
  }
}

export function checkSyncConditions(save: PlayerSave, data: GameData, memoryId: string): SyncCheck {
  const def = data.memoryById.get(memoryId);
  if (!def) return { ok: false, conditions: [{ text: '存在しないMemory', met: false }] };
  const conditions = (def.syncCondition ?? []).map((c) => describe(c, data, save));
  return { ok: conditions.every((c) => c.met), conditions };
}

/** Memory を検出する（存在が判明し、同期待ちになる） */
export function detectMemory(save: PlayerSave, memoryId: string): PlayerSave {
  const archive = save.archive;
  return {
    ...save,
    archive: {
      ...archive,
      discoveredMemoryIds: archive.discoveredMemoryIds.includes(memoryId) ? archive.discoveredMemoryIds : [...archive.discoveredMemoryIds, memoryId],
      pendingSyncIds: archive.pendingSyncIds.includes(memoryId) ? archive.pendingSyncIds : [...archive.pendingSyncIds, memoryId],
    },
  };
}

export type SyncResult =
  | { ok: true; save: PlayerSave; instance: PlayerMemory }
  | { ok: false; error: string; check?: SyncCheck };

export function syncMemory(save: PlayerSave, data: GameData, memoryId: string, at: string): SyncResult {
  if (!save.archive.pendingSyncIds.includes(memoryId)) return { ok: false, error: 'このMemoryはまだ検出されていません' };
  if (save.memories.some((m) => m.memoryId === memoryId)) return { ok: false, error: '既に同期済みです' };
  const check = checkSyncConditions(save, data, memoryId);
  if (!check.ok) return { ok: false, error: '同期条件を満たしていません', check };
  const r = acquireMemory(save, data, memoryId, 'MEMORY SYNC', at);
  if (!r.ok) return r;
  return {
    ok: true,
    instance: r.instance,
    save: { ...r.save, archive: { ...r.save.archive, pendingSyncIds: r.save.archive.pendingSyncIds.filter((id) => id !== memoryId) } },
  };
}
