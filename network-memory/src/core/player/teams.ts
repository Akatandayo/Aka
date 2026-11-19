import type { GameData } from '../data/gameData';
import { buildEntries, sortEntries, type MemoryEntry } from '../memory/query';
import { TEAM_SIZE, type PlayerSave, type PlayerTeam } from '../../types/player';

/**
 * 編成（PlayerTeams）の操作。
 * ルール:
 *  - 1チーム最大 TEAM_SIZE（3）体
 *  - 同じインスタンスは同一チームに1回まで
 *  - 同じ Memory（memoryId）は同一チームに1体まで
 */

export const TEAM_PRESET_COUNT = 3;

export function createDefaultTeams(): PlayerTeam[] {
  return Array.from({ length: TEAM_PRESET_COUNT }, (_, i) => ({
    id: `TEAM-${i + 1}`,
    name: `TEAM ${String(i + 1).padStart(2, '0')}`,
    slots: Array<string | null>(TEAM_SIZE).fill(null),
  }));
}

export function getTeam(save: PlayerSave, teamId: string): PlayerTeam | undefined {
  return save.teams.find((t) => t.id === teamId);
}

export function getActiveTeam(save: PlayerSave): PlayerTeam {
  return getTeam(save, save.activeTeamId) ?? save.teams[0];
}

function replaceTeam(save: PlayerSave, team: PlayerTeam): PlayerSave {
  return { ...save, teams: save.teams.map((t) => (t.id === team.id ? team : t)) };
}

export type TeamResult = { ok: true; save: PlayerSave } | { ok: false; error: string };

/**
 * 指定スロットに Memory を配置する（null で外す）。
 * - すでに同じチームにいるインスタンスを配置した場合は、スロットを入れ替える。
 * - 同じ memoryId の別インスタンスがいる場合は、そのスロットから外して配置する。
 */
export function assignToSlot(save: PlayerSave, teamId: string, slotIndex: number, instanceId: string | null): TeamResult {
  const team = getTeam(save, teamId);
  if (!team) return { ok: false, error: 'チームが存在しません' };
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= TEAM_SIZE) {
    return { ok: false, error: 'スロット番号が不正です' };
  }
  const slots = [...team.slots];
  if (instanceId === null) {
    slots[slotIndex] = null;
    return { ok: true, save: replaceTeam(save, { ...team, slots }) };
  }
  const inst = save.memories.find((m) => m.instanceId === instanceId);
  if (!inst) return { ok: false, error: '所持していないMemoryです' };

  const currentIndex = slots.indexOf(instanceId);
  if (currentIndex === slotIndex) return { ok: true, save };
  if (currentIndex >= 0) {
    // 入れ替え
    slots[currentIndex] = slots[slotIndex];
    slots[slotIndex] = instanceId;
    return { ok: true, save: replaceTeam(save, { ...team, slots }) };
  }
  // 同一 memoryId の重複を排除
  for (let i = 0; i < slots.length; i++) {
    const other = slots[i];
    if (!other || i === slotIndex) continue;
    const otherInst = save.memories.find((m) => m.instanceId === other);
    if (otherInst?.memoryId === inst.memoryId) slots[i] = null;
  }
  slots[slotIndex] = instanceId;
  return { ok: true, save: replaceTeam(save, { ...team, slots }) };
}

export function renameTeam(save: PlayerSave, teamId: string, name: string): TeamResult {
  const team = getTeam(save, teamId);
  if (!team) return { ok: false, error: 'チームが存在しません' };
  const trimmed = name.trim().slice(0, 16);
  if (!trimmed) return { ok: false, error: 'チーム名を入力してください' };
  return { ok: true, save: replaceTeam(save, { ...team, name: trimmed }) };
}

export function setActiveTeam(save: PlayerSave, teamId: string): TeamResult {
  if (!getTeam(save, teamId)) return { ok: false, error: 'チームが存在しません' };
  return { ok: true, save: { ...save, activeTeamId: teamId } };
}

export function clearTeam(save: PlayerSave, teamId: string): TeamResult {
  const team = getTeam(save, teamId);
  if (!team) return { ok: false, error: 'チームが存在しません' };
  return { ok: true, save: replaceTeam(save, { ...team, slots: Array(TEAM_SIZE).fill(null) }) };
}

/** おまかせ編成: 総合力の高い順に、memoryId が重複しないよう選ぶ */
export function autoFormation(save: PlayerSave, data: GameData, teamId: string): TeamResult {
  const team = getTeam(save, teamId);
  if (!team) return { ok: false, error: 'チームが存在しません' };
  const picked: string[] = [];
  const usedMemoryIds = new Set<string>();
  for (const e of sortEntries(buildEntries(save, data), 'cp', 'desc')) {
    if (usedMemoryIds.has(e.def.id)) continue;
    usedMemoryIds.add(e.def.id);
    picked.push(e.instance.instanceId);
    if (picked.length >= TEAM_SIZE) break;
  }
  const slots = Array.from({ length: TEAM_SIZE }, (_, i) => picked[i] ?? null);
  return { ok: true, save: replaceTeam(save, { ...team, slots }) };
}

/** チームのメンバー（空き枠は null）をエントリとして取得 */
export function teamEntries(save: PlayerSave, data: GameData, team: PlayerTeam): (MemoryEntry | null)[] {
  const all = new Map(buildEntries(save, data).map((e) => [e.instance.instanceId, e]));
  return team.slots.map((id) => (id ? (all.get(id) ?? null) : null));
}

/** インスタンス ID → 所属チーム ID 一覧 */
export function teamMembership(save: PlayerSave): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const t of save.teams) {
    for (const id of t.slots) {
      if (!id) continue;
      map.set(id, [...(map.get(id) ?? []), t.id]);
    }
  }
  return map;
}
