import { describeCondition, evaluateAll, evaluateCondition } from '../conditions';
import type { GameData } from '../data/gameData';
import type { QuestDefinition } from '../../types/exploration';
import type { PlayerSave } from '../../types/player';
import { applyRewards } from './exploration';

/**
 * サブクエスト（PHASE 4）。
 * 受注 → 達成条件（共通の条件式）をすべて満たす → 依頼人に報告して報酬、の流れ。
 * 達成状況は保存データから毎回算出する（進捗を二重に持たない）。
 */

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'completed';

export function questObjectives(save: PlayerSave, data: GameData, q: QuestDefinition): { label: string; met: boolean }[] {
  return q.objectives.map((o) => ({ label: o.label, met: evaluateCondition(o.cond, { save, data }) }));
}

export function questStatus(save: PlayerSave, data: GameData, q: QuestDefinition): QuestStatus {
  const st = save.quests[q.id];
  if (st?.status === 'completed') return 'completed';
  if (st?.status === 'active') return questObjectives(save, data, q).every((o) => o.met) ? 'ready' : 'active';
  return evaluateAll(q.unlock, { save, data }) ? 'available' : 'locked';
}

export function questUnlockText(save: PlayerSave, data: GameData, q: QuestDefinition): string[] {
  const ctx = { save, data };
  return q.unlock.filter((c) => !evaluateCondition(c, ctx)).map((c) => describeCondition(c, ctx));
}

export type QuestResult = { ok: true; save: PlayerSave } | { ok: false; error: string };

export function acceptQuest(save: PlayerSave, data: GameData, questId: string, at: string): QuestResult {
  const q = data.questById.get(questId);
  if (!q) return { ok: false, error: 'サブクエストが見つかりません' };
  if (questStatus(save, data, q) !== 'available') return { ok: false, error: 'このサブクエストは受注できません' };
  return { ok: true, save: { ...save, quests: { ...save.quests, [questId]: { status: 'active', acceptedAt: at } } } };
}

export function claimQuest(save: PlayerSave, data: GameData, questId: string, at: string): QuestResult {
  const q = data.questById.get(questId);
  if (!q) return { ok: false, error: 'サブクエストが見つかりません' };
  if (questStatus(save, data, q) !== 'ready') return { ok: false, error: 'まだ報告できません' };
  const acceptedAt = save.quests[questId]?.acceptedAt ?? at;
  const next = applyRewards(save, data, q.rewards, 'QUEST_REWARD', q.title, at);
  return { ok: true, save: { ...next, quests: { ...next.quests, [questId]: { status: 'completed', acceptedAt, completedAt: at } } } };
}

/** 報告待ち・進行中のサブクエスト数（LOBBY の通知用） */
export function questCounts(save: PlayerSave, data: GameData): { ready: number; active: number; available: number } {
  const out = { ready: 0, active: 0, available: 0 };
  for (const q of data.quests) {
    const s = questStatus(save, data, q);
    if (s === 'ready') out.ready++;
    else if (s === 'active') out.active++;
    else if (s === 'available') out.available++;
  }
  return out;
}
