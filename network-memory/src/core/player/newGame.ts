import { createExplorerCode, createId } from '../id';
import type { GameData } from '../data/gameData';
import { DEFAULT_AVATAR, DEFAULT_LOADOUT_CAPACITY_SAVE, DEFAULT_SETTINGS, SAVE_VERSION, STARTING_ITEMS, STARTING_WALLET, normalizePlayerName } from '../save/schema';
import { applyCurrencyChanges, emptyWallet } from './economy';
import { acquireMemory } from './memories';
import { autoLoadout, createDefaultLoadouts } from './loadout';
import { syncWorldProgress } from '../world/restoration';
import type { PlayerSave } from '../../types/player';

/** 探索者登録時に受け取る初期 Memory（acquisitionMethod に starter を持つもの） */
export function starterMemoryIds(data: GameData): string[] {
  return data.memories.filter((m) => m.acquisitionMethod.some((a) => a.type === 'starter')).map((m) => m.id);
}

export function createNewSave(rawName: string, data: GameData, at: string = new Date().toISOString()): PlayerSave {
  const name = normalizePlayerName(rawName) || 'EXPLORER';
  const loadouts = createDefaultLoadouts(DEFAULT_LOADOUT_CAPACITY_SAVE);
  let save: PlayerSave = {
    version: SAVE_VERSION,
    saveId: createId('save'),
    createdAt: at,
    updatedAt: at,
    profile: {
      playerId: createExplorerCode(),
      name,
      title: '新米探索者',
      level: 1,
      exp: 0,
      avatar: { ...DEFAULT_AVATAR },
      bio: '',
      createdAt: at,
      lastLoginAt: at,
    },
    wallet: emptyWallet(),
    transactions: [],
    memories: [],
    loadouts,
    activeLoadoutId: loadouts[0].id,
    loadoutCapacity: { ...DEFAULT_LOADOUT_CAPACITY_SAVE },
    archive: { discoveredMemoryIds: [], readFragmentIds: [], pendingSyncIds: [], readEntryIds: [] },
    battle: { encounters: {}, wins: 0, losses: 0, retreats: 0, records: [] },
    story: { completedChapters: [], current: null, choices: {} },
    worlds: {},
    exploration: { visitedAreas: [], points: {}, events: {}, lastArea: null },
    quests: {},
    inventory: { ...STARTING_ITEMS },
    progress: { flags: {} },
    settings: { ...DEFAULT_SETTINGS },
  };

  for (const id of starterMemoryIds(data)) {
    const r = acquireMemory(save, data, id, '探索者登録', at);
    if (r.ok) save = r.save;
  }

  const money = applyCurrencyChanges(
    save,
    Object.entries(STARTING_WALLET).map(([currency, amount]) => ({
      currency: currency as keyof typeof STARTING_WALLET,
      amount,
      reason: 'NEW_GAME' as const,
      note: '探索者登録ボーナス',
    })),
    at,
  );
  if (money.ok) save = money.save;

  const equip = autoLoadout(save, data, loadouts[0].id);
  if (equip.ok) save = equip.save;
  save = syncWorldProgress(save, data, at);

  return save;
}
