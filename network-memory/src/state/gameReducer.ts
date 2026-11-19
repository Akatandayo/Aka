import type { GameData } from '../core/data/gameData';
import { devAddCurrencies, devGrantAllMemories, devMaxLevelAll } from '../core/player/dev';
import { discover } from '../core/player/discovery';
import { toggleFavorite } from '../core/player/memories';
import { createNewSave } from '../core/player/newGame';
import { assignToSlot, autoFormation, clearTeam, renameTeam, setActiveTeam, type TeamResult } from '../core/player/teams';
import { normalizePlayerName } from '../core/save/schema';
import type { PlayerSave, PlayerSettings } from '../types/player';

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
  | { type: 'TOGGLE_FAVORITE'; instanceId: string }
  | { type: 'ASSIGN_SLOT'; teamId: string; slot: number; instanceId: string | null }
  | { type: 'RENAME_TEAM'; teamId: string; name: string }
  | { type: 'SET_ACTIVE_TEAM'; teamId: string }
  | { type: 'AUTO_TEAM'; teamId: string }
  | { type: 'CLEAR_TEAM'; teamId: string }
  | { type: 'DISCOVER'; memoryIds: string[]; fragmentIds: string[] }
  | { type: 'UPDATE_SETTINGS'; patch: Partial<PlayerSettings> }
  | { type: 'DEV_GRANT_ALL'; at: string }
  | { type: 'DEV_ADD_CURRENCY'; at: string }
  | { type: 'DEV_MAX_LEVEL' };

function fromTeam(save: PlayerSave, r: TeamResult): PlayerSave {
  if (!r.ok) {
    if (import.meta.env?.DEV) console.warn('[NETWORK] 編成エラー:', r.error);
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
    case 'TOGGLE_FAVORITE':
      return toggleFavorite(save, action.instanceId);
    case 'ASSIGN_SLOT':
      return fromTeam(save, assignToSlot(save, action.teamId, action.slot, action.instanceId));
    case 'RENAME_TEAM':
      return fromTeam(save, renameTeam(save, action.teamId, action.name));
    case 'SET_ACTIVE_TEAM':
      return fromTeam(save, setActiveTeam(save, action.teamId));
    case 'AUTO_TEAM':
      return fromTeam(save, autoFormation(save, data, action.teamId));
    case 'CLEAR_TEAM':
      return fromTeam(save, clearTeam(save, action.teamId));
    case 'DISCOVER':
      return discover(save, data, action.memoryIds, action.fragmentIds).save;
    case 'UPDATE_SETTINGS':
      return { ...save, settings: { ...save.settings, ...action.patch } };
    case 'DEV_GRANT_ALL':
      return devGrantAllMemories(save, data, action.at).save;
    case 'DEV_ADD_CURRENCY': {
      const r = devAddCurrencies(save, action.at);
      return r.ok ? r.save : save;
    }
    case 'DEV_MAX_LEVEL':
      return devMaxLevelAll(save, data);
  }
}
