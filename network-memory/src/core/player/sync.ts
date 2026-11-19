import type { GameData } from '../data/gameData';
import { describeCondition, evaluateCondition } from '../conditions';
import { syncWorldProgress } from '../world/restoration';
import { acquireMemory } from './memories';
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

export function checkSyncConditions(save: PlayerSave, data: GameData, memoryId: string): SyncCheck {
  const def = data.memoryById.get(memoryId);
  if (!def) return { ok: false, conditions: [{ text: '存在しないMemory', met: false }] };
  const ctx = { save, data };
  const conditions = def.unlockConditions.map((c) => ({ text: describeCondition(c, ctx), met: evaluateCondition(c, ctx) }));
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
  // Memory の回収によって、対応する WORLD の修復状態が更新される（GDD Ver.3 §5）
  const next = { ...r.save, archive: { ...r.save.archive, pendingSyncIds: r.save.archive.pendingSyncIds.filter((id) => id !== memoryId) } };
  return { ok: true, instance: r.instance, save: syncWorldProgress(next, data, at) };
}
