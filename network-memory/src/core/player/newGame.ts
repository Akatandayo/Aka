import { createExplorerCode, createId } from '../id';
import type { GameData } from '../data/gameData';
import { DEFAULT_SETTINGS, SAVE_VERSION, STARTING_WALLET, normalizePlayerName } from '../save/schema';
import { applyCurrencyChanges, emptyWallet } from './economy';
import { acquireMemory } from './memories';
import { autoFormation, createDefaultTeams } from './teams';
import type { PlayerSave } from '../../types/player';

/** 探索者登録時に受け取る初期 Memory（acquisitionMethod に starter を持つもの） */
export function starterMemoryIds(data: GameData): string[] {
  return data.memories.filter((m) => m.acquisitionMethod.some((a) => a.type === 'starter')).map((m) => m.id);
}

export function createNewSave(rawName: string, data: GameData, at: string = new Date().toISOString()): PlayerSave {
  const name = normalizePlayerName(rawName) || 'EXPLORER';
  const teams = createDefaultTeams();
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
      createdAt: at,
      lastLoginAt: at,
    },
    wallet: emptyWallet(),
    transactions: [],
    memories: [],
    teams,
    activeTeamId: teams[0].id,
    archive: { discoveredMemoryIds: [], readFragmentIds: [] },
    inventory: {},
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

  const team = autoFormation(save, data, teams[0].id);
  if (team.ok) save = team.save;

  return save;
}
