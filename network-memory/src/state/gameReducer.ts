import { applyBattleOutcome, type BattleOutcome } from '../core/battle/result';
import type { GameData } from '../core/data/gameData';
import { devAddCurrencies, devGrantAllMemories, devMaxLevelAll } from '../core/player/dev';
import { discover } from '../core/player/discovery';
import { autoLoadout, clearLoadout, equipMemory, renameLoadout, setActiveLoadout, type LoadoutResult } from '../core/player/loadout';
import { toggleFavorite } from '../core/player/memories';
import { createNewSave } from '../core/player/newGame';
import { syncMemory } from '../core/player/sync';
import { PLAYER_BIO_MAX, normalizePlayerName } from '../core/save/schema';
import type { FlagValue } from '../core/story/engine';
import { completeChapter, saveStoryProgress } from '../core/story/progress';
import { syncWorldProgress } from '../core/world/restoration';
import type { LoadoutSlotType, PlayerAvatar, PlayerSave, PlayerSettings } from '../types/player';

/**
 * セーブデータに対するすべての変更はこの reducer を通す。
 * 実際のロジックは core/ 以下の純粋関数に委譲し、ここは振り分けのみを行う。
 * `at`（ISO 時刻）はアクション側で付与し、reducer を決定的に保つ。
 */
export type GameAction =
  | { type: 'NEW_GAME'; name: string; at: string }
  | { type: 'LOAD'; save: PlayerSave }
  | { type: 'RESET' }
  | { type: 'TOUCH_LOGIN'; at: string }
  | { type: 'RENAME_PLAYER'; name: string }
  | { type: 'UPDATE_PROFILE'; bio?: string; avatar?: Partial<PlayerAvatar> }
  | { type: 'TOGGLE_FAVORITE'; instanceId: string }
  | { type: 'EQUIP'; loadoutId: string; slot: LoadoutSlotType; index: number; instanceId: string | null }
  | { type: 'RENAME_LOADOUT'; loadoutId: string; name: string }
  | { type: 'SET_ACTIVE_LOADOUT'; loadoutId: string }
  | { type: 'AUTO_LOADOUT'; loadoutId: string }
  | { type: 'CLEAR_LOADOUT'; loadoutId: string }
  | { type: 'DISCOVER'; memoryIds: string[]; fragmentIds: string[] }
  | { type: 'SYNC_MEMORY'; memoryId: string; at: string }
  | { type: 'COMMIT_BATTLE'; outcome: BattleOutcome; at: string }
  | { type: 'STORY_PROGRESS'; chapterId: string; index: number; flags: Record<string, FlagValue>; choices: Record<string, string> }
  | { type: 'STORY_COMPLETE'; chapterId: string; flags: Record<string, FlagValue>; detected: string[]; at: string }
  | { type: 'STORY_RESET_CURRENT' }
  | { type: 'ARCHIVE_READ'; entryIds: string[] }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<PlayerSettings> }
  | { type: 'DEV_GRANT_ALL'; at: string }
  | { type: 'DEV_ADD_CURRENCY'; at: string }
  | { type: 'DEV_MAX_LEVEL' };

function fromLoadout(save: PlayerSave, r: LoadoutResult): PlayerSave {
  if (!r.ok) {
    if (import.meta.env?.DEV) console.warn('[NETWORK] 装備エラー:', r.error);
    return save;
  }
  return r.save;
}

export function gameReducer(save: PlayerSave | null, action: GameAction, data: GameData): PlayerSave | null {
  switch (action.type) {
    case 'NEW_GAME':
      return createNewSave(action.name, data, action.at);
    case 'LOAD':
      return action.save;
    case 'RESET':
      return null;
  }
  if (!save) return save;

  switch (action.type) {
    case 'TOUCH_LOGIN':
      return { ...save, profile: { ...save.profile, lastLoginAt: action.at } };
    case 'RENAME_PLAYER': {
      const name = normalizePlayerName(action.name);
      return name ? { ...save, profile: { ...save.profile, name } } : save;
    }
    case 'UPDATE_PROFILE': {
      const profile = { ...save.profile };
      if (action.bio !== undefined) profile.bio = action.bio.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, PLAYER_BIO_MAX);
      if (action.avatar) {
        const color = action.avatar.color;
        profile.avatar = {
          ...profile.avatar,
          ...(color && /^#[0-9a-fA-F]{6}$/.test(color) ? { color } : {}),
          ...(action.avatar.preset && /^[a-z0-9-]{1,32}$/.test(action.avatar.preset) ? { preset: action.avatar.preset } : {}),
        };
      }
      return { ...save, profile };
    }
    case 'TOGGLE_FAVORITE':
      return toggleFavorite(save, action.instanceId);
    case 'EQUIP':
      return fromLoadout(save, equipMemory(save, data, action.loadoutId, action.slot, action.index, action.instanceId));
    case 'RENAME_LOADOUT':
      return fromLoadout(save, renameLoadout(save, action.loadoutId, action.name));
    case 'SET_ACTIVE_LOADOUT':
      return fromLoadout(save, setActiveLoadout(save, action.loadoutId));
    case 'AUTO_LOADOUT':
      return fromLoadout(save, autoLoadout(save, data, action.loadoutId));
    case 'CLEAR_LOADOUT':
      return fromLoadout(save, clearLoadout(save, action.loadoutId));
    case 'DISCOVER':
      return discover(save, data, action.memoryIds, action.fragmentIds).save;
    case 'SYNC_MEMORY': {
      const r = syncMemory(save, data, action.memoryId, action.at);
      return r.ok ? r.save : save;
    }
    case 'COMMIT_BATTLE':
      return applyBattleOutcome(save, data, action.outcome, action.at).save;
    case 'STORY_PROGRESS':
      return saveStoryProgress(save, action.chapterId, action.index, action.flags, action.choices);
    case 'STORY_COMPLETE':
      return completeChapter(save, data, action.chapterId, action.flags, action.detected, action.at).save;
    case 'STORY_RESET_CURRENT':
      return { ...save, story: { ...save.story, current: null } };
    case 'ARCHIVE_READ': {
      const read = new Set(save.archive.readEntryIds);
      const add = action.entryIds.filter((id) => !read.has(id));
      return add.length ? { ...save, archive: { ...save.archive, readEntryIds: [...save.archive.readEntryIds, ...add] } } : save;
    }
    case 'UPDATE_SETTINGS':
      return { ...save, settings: { ...save.settings, ...action.patch } };
    case 'DEV_GRANT_ALL':
      return syncWorldProgress(devGrantAllMemories(save, data, action.at).save, data, action.at);
    case 'DEV_ADD_CURRENCY': {
      const r = devAddCurrencies(save, action.at);
      return r.ok ? r.save : save;
    }
    case 'DEV_MAX_LEVEL':
      return devMaxLevelAll(save, data);
  }
}
