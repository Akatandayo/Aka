import type { GameData } from '../data/gameData';
import { maxLevel } from '../memory/stats';
import { applyCurrencyChanges } from './economy';
import { acquireMemory } from './memories';
import { CURRENCIES, type PlayerSave } from '../../types/player';

/**
 * 開発者ツール（SETTINGS > 開発者モード）。
 * 本来の入手・育成システム（PHASE 2 以降）が実装されるまでの動作確認用。
 * 画面上でも DEV と明示して使用する。
 */

export function devGrantAllMemories(save: PlayerSave, data: GameData, at: string): { save: PlayerSave; granted: number } {
  const owned = new Set(save.memories.map((m) => m.memoryId));
  let next = save;
  let granted = 0;
  for (const def of data.memories) {
    if (owned.has(def.id)) continue;
    const r = acquireMemory(next, data, def.id, 'DEV: 付与', at);
    if (r.ok) {
      next = r.save;
      granted++;
    }
  }
  return { save: next, granted };
}

export function devAddCurrencies(save: PlayerSave, at: string): { ok: true; save: PlayerSave } | { ok: false; error: string } {
  const amounts = { DATA: 10000, FRAGMENT: 500, CORE: 50, CREDIT: 1000 } as const;
  const r = applyCurrencyChanges(
    save,
    CURRENCIES.map((currency) => ({ currency, amount: amounts[currency], reason: 'DEV_GRANT' as const, note: 'DEV: 通貨付与' })),
    at,
  );
  return r.ok ? { ok: true, save: r.save } : r;
}

export function devMaxLevelAll(save: PlayerSave, data: GameData): PlayerSave {
  return {
    ...save,
    memories: save.memories.map((m) => {
      const def = data.memoryById.get(m.memoryId);
      return def ? { ...m, level: maxLevel(def.rarity, m.limitBreak) } : m;
    }),
  };
}
