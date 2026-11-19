import type { GameData } from '../data/gameData';
import type { PlayerSave } from '../../types/player';

/**
 * 発見（ARCHIVE の基礎）。
 * - 所持 … Memory を持っている
 * - 発見済み … 存在は判明しているが未所持
 * - 未発見 … 存在そのものが分からない（??? 表示）
 */
export type DiscoveryState = 'owned' | 'discovered' | 'undiscovered';

export function discoveryState(save: PlayerSave, memoryId: string): DiscoveryState {
  if (save.memories.some((m) => m.memoryId === memoryId)) return 'owned';
  if (save.archive.discoveredMemoryIds.includes(memoryId)) return 'discovered';
  return 'undiscovered';
}

export interface DiscoverResult {
  save: PlayerSave;
  newlyDiscovered: string[];
}

/** Memory の存在を発見済みにし、閲覧した断片を記録する */
export function discover(save: PlayerSave, data: GameData, memoryIds: string[], fragmentIds: string[] = []): DiscoverResult {
  const known = new Set(save.archive.discoveredMemoryIds);
  const newlyDiscovered = [...new Set(memoryIds)].filter((id) => data.memoryById.has(id) && !known.has(id));
  const read = new Set(save.archive.readFragmentIds);
  const newFragments = [...new Set(fragmentIds)].filter((id) => !read.has(id));
  if (newlyDiscovered.length === 0 && newFragments.length === 0) return { save, newlyDiscovered };
  return {
    newlyDiscovered,
    save: {
      ...save,
      archive: {
        discoveredMemoryIds: [...save.archive.discoveredMemoryIds, ...newlyDiscovered],
        readFragmentIds: [...save.archive.readFragmentIds, ...newFragments],
      },
    },
  };
}

export interface CollectionSummary {
  total: number;
  owned: number;
  discovered: number;
}

export function collectionSummary(save: PlayerSave, data: GameData): CollectionSummary {
  const owned = new Set(save.memories.map((m) => m.memoryId).filter((id) => data.memoryById.has(id)));
  const discovered = new Set([...save.archive.discoveredMemoryIds.filter((id) => data.memoryById.has(id)), ...owned]);
  return { total: data.memories.length, owned: owned.size, discovered: discovered.size };
}
